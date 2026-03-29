import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "ethers";

describe("TapOrder — createOrder", function () {
  const BTC_ASSET = "BTC/USD";
  const DURATION = 60; // 1 min
  const MULTIPLIER_2X = 200n;  // 200 bps
  const MULTIPLIER_5X = 500n;
  const MULTIPLIER_10X = 1000n;
  const STAKE = parseUnits("0.01", "ether");

  async function deployContracts() {
    const [owner, user, other] = await ethers.getSigners();

    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();

    const PayoutPool = await ethers.getContractFactory("PayoutPool");
    const pool = await PayoutPool.deploy();

    // Whitelist BTC asset FIRST (needed for pool funding)
    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());

    const TapOrder = await ethers.getContractFactory("TapOrder");
    const tapOrder = await TapOrder.deploy(await adapter.getAddress(), await pool.getAddress());

    // Give TapOrder permission to call PayoutPool.payout()
    const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
    await pool.grantRole(PAYOUT_ROLE, await tapOrder.getAddress());

    // Fund PayoutPool with 100 ETH (use btcFeed address as asset key)
    await pool.deposit(await btcFeed.getAddress(), { value: parseUnits("100", "ether") });

    await tapOrder.addAsset(BTC_ASSET, await btcFeed.getAddress());

    return { owner, user, other, tapOrder, pool, adapter, btcFeed };
  }

  it("assigns incrementing orderId", async function () {
    const { user, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    const tx1 = await tapOrder.connect(user).createOrder(
      BTC_ASSET, currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
    );
    const rc1 = await tx1.wait();
    const e1 = rc1?.logs.find(l => l.fragment?.name === "OrderCreated");
    const orderId1 = e1?.args[0];

    const tx2 = await tapOrder.connect(user).createOrder(
      BTC_ASSET, currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
    );
    const rc2 = await tx2.wait();
    const e2 = rc2?.logs.find(l => l.fragment?.name === "OrderCreated");
    const orderId2 = e2?.args[0];

    expect(orderId2).to.equal(orderId1 + 1n);
  });

  it("locks stake (msg.value) in contract", async function () {
    const { user, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const balBefore = await ethers.provider.getBalance(await tapOrder.getAddress());

    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    await tapOrder.connect(user).createOrder(
      BTC_ASSET, currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
    );

    const balAfter = await ethers.provider.getBalance(await tapOrder.getAddress());
    expect(balAfter - balBefore).to.equal(STAKE);
  });

  it("reverts when asset is not whitelisted", async function () {
    const { user, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    await expect(
      tapOrder.connect(user).createOrder(
        "ETH/USD", currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
      )
    ).to.be.revertedWith("AssetNotWhitelisted");
  });

  it("reverts when contract is paused", async function () {
    const { owner, user, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    await tapOrder.connect(owner).pause();

    await expect(
      tapOrder.connect(user).createOrder(
        BTC_ASSET, currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
      )
    ).to.be.revertedWith("Pausable: paused");
  });

  it("reverts when multiplier is not in allowed list", async function () {
    const { user, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    await expect(
      tapOrder.connect(user).createOrder(
        BTC_ASSET, currentPrice + 1000n, true, DURATION, 333, { value: STAKE } // 333 bps not allowed
      )
    ).to.be.revertedWith("InvalidMultiplier");
  });

  it("reverts when PayoutPool has insufficient liquidity", async function () {
    const { owner, user, tapOrder, pool, btcFeed } = await loadFixture(deployContracts);
    const currentPrice = parseUnits("65000", 8);
    await btcFeed.updateAnswer(currentPrice);

    // Drain pool using owner (who has DEFAULT_ADMIN_ROLE)
    await pool.connect(owner).withdraw(await btcFeed.getAddress(), parseUnits("100", "ether"), await owner.getAddress());

    await expect(
      tapOrder.connect(user).createOrder(
        BTC_ASSET, currentPrice + 1000n, true, DURATION, MULTIPLIER_5X, { value: STAKE }
      )
    ).to.be.revertedWithCustomError(tapOrder, "InsufficientLiquidity");
  });
});

describe("TapOrder — settlement", function () {
  const BTC_ASSET = "BTC/USD";
  const DURATION = 60;
  const MULTIPLIER_2X = 200n;
  const MULTIPLIER_5X = 500n;
  const MULTIPLIER_10X = 1000n;
  const STAKE = parseUnits("0.01", "ether");

  async function deployContracts() {
    const [owner, user, other] = await ethers.getSigners();

    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();

    const PayoutPool = await ethers.getContractFactory("PayoutPool");
    const pool = await PayoutPool.deploy();

    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());

    const TapOrder = await ethers.getContractFactory("TapOrder");
    const tapOrder = await TapOrder.deploy(await adapter.getAddress(), await pool.getAddress());

    const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
    await pool.grantRole(PAYOUT_ROLE, await tapOrder.getAddress());
    await pool.deposit(await btcFeed.getAddress(), { value: parseUnits("100", "ether") });

    await tapOrder.addAsset(BTC_ASSET, await btcFeed.getAddress());

    return { owner, user, other, tapOrder, pool, adapter, btcFeed };
  }

  async function createOrder(
    tapOrder: any,
    user: any,
    btcFeed: any,
    targetPrice: bigint,
    isAbove: boolean,
    multiplierBps: bigint,
    duration: bigint = DURATION
  ) {
    await btcFeed.updateAnswer(parseUnits("65000", 8));
    const tx = await tapOrder.connect(user).createOrder(
      BTC_ASSET, targetPrice, isAbove, duration, multiplierBps, { value: STAKE }
    );
    const rc = await tx.wait();
    const log = rc?.logs.find((l: any) => l.fragment?.name === "OrderCreated");
    return log?.args[0]; // orderId
  }

  it("settles WIN when price touches target exactly (inclusive)", async function () {
    const { user, other, tapOrder, pool, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8); // +0.77% from 65000
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    // Move price TO exactly the target
    await btcFeed.updateAnswer(targetPrice);

    const userAddr = await user.getAddress();
    const expectedPayout = (BigInt(STAKE) * MULTIPLIER_5X) / 10000n;
    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderWon")
      .withArgs(orderId, userAddr, expectedPayout);

    const order = await tapOrder.orders(orderId);
    expect(order.status).to.equal(1); // WON
  });

  it("settles WIN when price gaps THROUGH target", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    // Price jumps from 65000 to 65600 — gapped THROUGH target
    await btcFeed.updateAnswer(parseUnits("65600", 8));

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderWon");

    const order = await tapOrder.orders(orderId);
    expect(order.status).to.equal(1); // WON
  });

  it("settles LOST when expiry reached without touch", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    // Advance time past expiry (60s duration + 1s buffer)
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderLost")
      .withArgs(orderId, await user.getAddress());

    const order = await tapOrder.orders(orderId);
    expect(order.status).to.equal(2); // LOST
  });

  it("reverts when settling an already settled order (idempotent)", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    await btcFeed.updateAnswer(targetPrice);
    await tapOrder.connect(other).settleOrder(orderId);

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.be.revertedWith("AlreadySettled");
  });

  it("reverts when Chainlink feed is stale (>60s)", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    // Advance 61 seconds (past stale threshold)
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.be.revertedWith("StalePriceFeed");
  });

  it("correctly transfers payout = stake × multiplier to user", async function () {
    const { user, other, tapOrder, pool, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_10X);

    const expectedPayout = (STAKE * MULTIPLIER_10X) / 10000n; // 0.1 ETH
    const userBalBefore = await ethers.provider.getBalance(await user.getAddress());

    await btcFeed.updateAnswer(targetPrice);
    await tapOrder.connect(other).settleOrder(orderId);

    const userBalAfter = await ethers.provider.getBalance(await user.getAddress());
    // Account for gas costs — payout should be added
    expect(userBalAfter - userBalBefore + 1000000n).to.be.greaterThanOrEqual(expectedPayout);
  });

  it("emits OrderWon with correct args on win", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);
    const expectedPayout = (STAKE * MULTIPLIER_5X) / 10000n;

    await btcFeed.updateAnswer(targetPrice);

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderWon")
      .withArgs(orderId, await user.getAddress(), expectedPayout);
  });

  it("emits OrderLost with correct args on loss", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderLost")
      .withArgs(orderId, await user.getAddress());
  });

  it("batchSettle handles partial failures without reverting whole batch", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    // Order 1: will WIN
    const orderId1 = await createOrder(tapOrder, user, btcFeed, parseUnits("65500", 8), true, MULTIPLIER_5X);
    await btcFeed.updateAnswer(parseUnits("65500", 8));

    // Order 2: stale — will fail
    const orderId2 = await createOrder(tapOrder, user, btcFeed, parseUnits("66000", 8), true, MULTIPLIER_5X);
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    // batchSettle should NOT revert even though order 2 fails
    await expect(
      tapOrder.connect(other).batchSettle([orderId1, orderId2])
    ).not.to.be.reverted;

    // Order 1 should be settled as WON
    const order1 = await tapOrder.orders(orderId1);
    expect(order1.status).to.equal(1); // WON
  });

  it("settleOrder is permissionless (anyone can call)", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);

    const targetPrice = parseUnits("65500", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, targetPrice, true, MULTIPLIER_5X);
    await btcFeed.updateAnswer(targetPrice);

    // Other (non-owner, non-user) can settle
    await expect(tapOrder.connect(other).settleOrder(orderId))
      .to.emit(tapOrder, "OrderWon");
  });
});

describe("TapOrder — access control", function () {
  const BTC_ASSET = "BTC/USD";
  const DURATION = 60;
  const MULTIPLIER_5X = 500n;
  const STAKE = parseUnits("0.01", "ether");

  async function deployContracts() {
    const [owner, user, other] = await ethers.getSigners();

    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();

    const PayoutPool = await ethers.getContractFactory("PayoutPool");
    const pool = await PayoutPool.deploy();

    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());

    const TapOrder = await ethers.getContractFactory("TapOrder");
    const tapOrder = await TapOrder.deploy(await adapter.getAddress(), await pool.getAddress());

    const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
    await pool.grantRole(PAYOUT_ROLE, await tapOrder.getAddress());
    await pool.deposit(await btcFeed.getAddress(), { value: parseUnits("100", "ether") });

    await tapOrder.addAsset(BTC_ASSET, await btcFeed.getAddress());

    return { owner, user, other, tapOrder, pool, adapter, btcFeed };
  }

  it("only owner can pause/unpause", async function () {
    const { user, tapOrder } = await loadFixture(deployContracts);

    await expect(tapOrder.connect(user).pause()).to.be.revertedWith("OwnableUnauthorizedAccount");
    await expect(tapOrder.connect(user).unpause()).to.be.revertedWith("OwnableUnauthorizedAccount");
  });

  it("only TapOrder can call PayoutPool.payout()", async function () {
    const { owner, user, pool, btcFeed } = await loadFixture(deployContracts);

    // Try calling payout directly (without PAYOUT_ROLE) — should fail
    await expect(
      pool.connect(user).payout(ethers.ZeroAddress, await user.getAddress(), parseUnits("1", "ether"))
    ).to.be.reverted;

    // Even owner can't call payout directly (no PAYOUT_ROLE on owner here)
    await expect(
      pool.connect(owner).payout(ethers.ZeroAddress, await owner.getAddress(), parseUnits("1", "ether"))
    ).to.be.revertedWith(
      `AccessControl: account ${(await owner.getAddress()).toLowerCase()} is missing role ${await pool.PAYOUT_ROLE()}`
    );
  });
});

describe("TapOrder — isAbove logic", function () {
  const BTC_ASSET = "BTC/USD";
  const DURATION = 60;
  const MULTIPLIER_5X = 500n;
  const STAKE = parseUnits("0.01", "ether");

  async function deployContracts() {
    const [owner, user, other] = await ethers.getSigners();

    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();

    const PayoutPool = await ethers.getContractFactory("PayoutPool");
    const pool = await PayoutPool.deploy();

    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());

    const TapOrder = await ethers.getContractFactory("TapOrder");
    const tapOrder = await TapOrder.deploy(await adapter.getAddress(), await pool.getAddress());

    const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
    await pool.grantRole(PAYOUT_ROLE, await tapOrder.getAddress());
    await pool.deposit(await btcFeed.getAddress(), { value: parseUnits("100", "ether") });

    await tapOrder.addAsset(BTC_ASSET, await btcFeed.getAddress());

    return { owner, user, other, tapOrder, pool, adapter, btcFeed };
  }

  async function createOrder(
    tapOrder: any, user: any, btcFeed: any,
    targetPrice: bigint, isAbove: boolean
  ) {
    await btcFeed.updateAnswer(parseUnits("65000", 8));
    const tx = await tapOrder.connect(user).createOrder(
      BTC_ASSET, targetPrice, isAbove, DURATION, MULTIPLIER_5X, { value: STAKE }
    );
    const rc = await tx.wait();
    const log = rc?.logs.find((l: any) => l.fragment?.name === "OrderCreated");
    return log?.args[0];
  }

  it("WIN when isAbove=true and price rises TO target", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const target = parseUnits("66000", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, target, true);
    await btcFeed.updateAnswer(target);
    await tapOrder.connect(other).settleOrder(orderId);
    expect((await tapOrder.orders(orderId)).status).to.equal(1); // WON
  });

  it("WIN when isAbove=false and price falls TO target", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const target = parseUnits("64000", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, target, false);
    await btcFeed.updateAnswer(target);
    await tapOrder.connect(other).settleOrder(orderId);
    expect((await tapOrder.orders(orderId)).status).to.equal(1); // WON
  });

  it("LOST when isAbove=true but price falls (never reaches target)", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const target = parseUnits("66000", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, target, true);
    // Price falls to 64000
    await btcFeed.updateAnswer(parseUnits("64000", 8));
    await tapOrder.connect(other).settleOrder(orderId);
    expect((await tapOrder.orders(orderId)).status).to.equal(2); // LOST
  });

  it("LOST when isAbove=false but price rises (never reaches target)", async function () {
    const { user, other, tapOrder, btcFeed } = await loadFixture(deployContracts);
    const target = parseUnits("64000", 8);
    const orderId = await createOrder(tapOrder, user, btcFeed, target, false);
    // Price rises to 66000
    await btcFeed.updateAnswer(parseUnits("66000", 8));
    await tapOrder.connect(other).settleOrder(orderId);
    expect((await tapOrder.orders(orderId)).status).to.equal(2); // LOST
  });
});
