import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "ethers";

describe("PriceFeedAdapter", function () {
  const BTC_ASSET = "BTC/USD";
  const STALE_THRESHOLD = 60; // seconds

  async function deployAdapter() {
    const [owner, user] = await ethers.getSigners();

    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));

    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());

    return { owner, user, adapter, btcFeed };
  }

  it("returns correct price and updatedAt from Chainlink", async function () {
    const { adapter, btcFeed } = await loadFixture(deployAdapter);

    // Set a known price
    const price = parseUnits("66000", 8);
    await btcFeed.updateAnswer(price);

    const [returnedPrice, updatedAt] = await adapter.getLatestPrice(BTC_ASSET);
    expect(returnedPrice).to.equal(price);
    expect(updatedAt).to.be.greaterThan(0);
  });

  it("returns only the price via getPrice()", async function () {
    const { adapter, btcFeed } = await loadFixture(deployAdapter);
    const price = parseUnits("67000", 8);
    await btcFeed.updateAnswer(price);
    expect(await adapter.getPrice(BTC_ASSET)).to.equal(price);
  });

  // Helper to avoid重复 deployFixtures
  async function deployContracts() {
    const [owner, user] = await ethers.getSigners();
    const FeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const btcFeed = await FeedFactory.deploy(parseUnits("65000", 8));
    const PriceFeedAdapter = await ethers.getContractFactory("PriceFeedAdapter");
    const adapter = await PriceFeedAdapter.deploy();
    await adapter.setFeed(BTC_ASSET, await btcFeed.getAddress());
    return { owner, user, adapter, btcFeed };
  }

  it("reverts if price <= 0 (on Chainlink feed returning 0)", async function () {
    const { adapter } = await loadFixture(deployContracts);

    // Deploy a mock that returns 0
    const BadFeedFactory = await ethers.getContractFactory("MockV3Aggregator");
    const badFeed = await BadFeedFactory.deploy(0);
    await adapter.setFeed("BAD/USD", await badFeed.getAddress());

    await expect(adapter.getLatestPrice("BAD/USD")).to.be.reverted;
  });

  it("reverts if updatedAt > STALE_THRESHOLD seconds ago", async function () {
    const { adapter, btcFeed } = await loadFixture(deployContracts);

    // Set price with timestamp in the past (> 60s)
    const staleTimestamp = (await ethers.provider.getBlock('latest'))!.timestamp - 100;
    await btcFeed.updateAnswerAndTimestamp(parseUnits("66000", 8), staleTimestamp);

    await expect(adapter.getLatestPrice(BTC_ASSET)).to.be.revertedWith(
      `StalePriceFeed("${BTC_ASSET}"`
    );
  });

  it("accepts price updated within 60s", async function () {
    const { adapter, btcFeed } = await loadFixture(deployContracts);

    // Recent timestamp (30s ago)
    const recentTimestamp = (await ethers.provider.getBlock('latest'))!.timestamp - 30;
    await btcFeed.updateAnswerAndTimestamp(parseUnits("66000", 8), recentTimestamp);

    const [price] = await adapter.getLatestPrice(BTC_ASSET);
    expect(price).to.equal(parseUnits("66000", 8));
  });

  it("reverts when asset feed is not set", async function () {
    const { adapter } = await loadFixture(deployAdapter);
    await expect(adapter.getLatestPrice("UNKNOWN/ETH")).to.be.revertedWith("FeedNotSet");
  });

  it("STALE_THRESHOLD constant is 60 seconds", async function () {
    const { adapter } = await loadFixture(deployAdapter);
    expect(await adapter.STALE_THRESHOLD()).to.equal(60);
  });
});
