import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "ethers";

describe("PayoutPool", function () {
  const ASSET = ethers.ZeroAddress; // Native ETH

  async function deployPool() {
    const [owner, user, other, recipient] = await ethers.getSigners();
    const PayoutPool = await ethers.getContractFactory("PayoutPool");
    const pool = await PayoutPool.deploy();
    return { owner, user, other, recipient, pool };
  }

  describe("deposit()", function () {
    it("accepts ETH deposits and increases balance", async function () {
      const { user, pool } = await loadFixture(deployPool);
      const amount = parseUnits("10", "ether");

      await pool.connect(user).deposit(ASSET, { value: amount });
      expect(await pool.getBalance(ASSET)).to.equal(amount);
    });

    it("reverts when depositing zero", async function () {
      const { user, pool } = await loadFixture(deployPool);
      await expect(pool.connect(user).deposit(ASSET, { value: 0 }))
        .to.be.revertedWith("ZeroDeposit");
    });

    it("emits Deposited event", async function () {
      const { user, pool } = await loadFixture(deployPool);
      const amount = parseUnits("5", "ether");

      await expect(pool.connect(user).deposit(ASSET, { value: amount }))
        .to.emit(pool, "Deposited")
        .withArgs(ASSET, await user.getAddress(), amount);
    });

    it("is pausable — rejects deposits when paused", async function () {
      const { owner, user, pool } = await loadFixture(deployPool);
      await pool.connect(owner).pause();
      await expect(
        pool.connect(user).deposit(ASSET, { value: parseUnits("1", "ether") })
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("withdraw()", function () {
    it("owner can withdraw deposited funds", async function () {
      const { owner, recipient, pool } = await loadFixture(deployPool);
      await pool.deposit(ASSET, { value: parseUnits("10", "ether") });
      const balBefore = await ethers.provider.getBalance(await recipient.getAddress());

      await pool.withdraw(ASSET, parseUnits("5", "ether"), await recipient.getAddress());

      expect(await pool.getBalance(ASSET)).to.equal(parseUnits("5", "ether"));
      // balance after should be ~before + 5 - gas
      const balAfter = await ethers.provider.getBalance(await recipient.getAddress());
      expect(balAfter - balBefore + 1000000n).to.be.greaterThanOrEqual(parseUnits("5", "ether"));
    });

    it("reverts if amount exceeds balance", async function () {
      const { owner, recipient, pool } = await loadFixture(deployPool);
      await pool.deposit(ASSET, { value: parseUnits("1", "ether") });
      await expect(
        pool.withdraw(ASSET, parseUnits("2", "ether"), await recipient.getAddress())
      ).to.be.revertedWith("InsufficientBalance");
    });

    it("reverts if caller is not owner", async function () {
      const { user, recipient, pool } = await loadFixture(deployPool);
      await pool.deposit(ASSET, { value: parseUnits("10", "ether") });
      await expect(
        pool.connect(user).withdraw(ASSET, parseUnits("1", "ether"), await recipient.getAddress())
      ).to.be.revertedWith(
        `AccessControl: account ${(await user.getAddress()).toLowerCase()} is missing role`
      );
    });

    it("emits Withdrawn event", async function () {
      const { owner, recipient, pool } = await loadFixture(deployPool);
      await pool.deposit(ASSET, { value: parseUnits("10", "ether") });
      await expect(pool.withdraw(ASSET, parseUnits("3", "ether"), await recipient.getAddress()))
        .to.emit(pool, "Withdrawn")
        .withArgs(ASSET, await recipient.getAddress(), parseUnits("3", "ether"));
    });
  });

  describe("payout()", function () {
    it("only accounts with PAYOUT_ROLE can call payout", async function () {
      const { owner, user, other, pool } = await loadFixture(deployPool);

      await pool.deposit(ASSET, { value: parseUnits("100", "ether") });

      // user (no role) cannot call payout
      await expect(
        pool.connect(user).payout(ASSET, await user.getAddress(), parseUnits("1", "ether"))
      ).to.be.reverted;

      // Grant PAYOUT_ROLE to user
      const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
      await pool.grantRole(PAYOUT_ROLE, await user.getAddress());

      // Now user can payout
      await pool.connect(user).payout(ASSET, await other.getAddress(), parseUnits("1", "ether"));
      expect(await pool.getBalance(ASSET)).to.equal(parseUnits("99", "ether"));
    });

    it("reverts if pool balance is insufficient", async function () {
      const { owner, user, pool } = await loadFixture(deployPool);

      const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
      await pool.grantRole(PAYOUT_ROLE, await user.getAddress());
      await pool.deposit(ASSET, { value: parseUnits("0.5", "ether") });

      await expect(
        pool.connect(user).payout(ASSET, await user.getAddress(), parseUnits("1", "ether"))
      ).to.be.revertedWith("InsufficientLiquidity");
    });

    it("emits Payout event on successful payout", async function () {
      const { owner, user, other, pool } = await loadFixture(deployPool);
      const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
      await pool.grantRole(PAYOUT_ROLE, await user.getAddress());
      await pool.deposit(ASSET, { value: parseUnits("10", "ether") });

      await expect(
        pool.connect(user).payout(ASSET, await other.getAddress(), parseUnits("2", "ether"))
      ).to.emit(pool, "Payout")
        .withArgs(ASSET, await other.getAddress(), parseUnits("2", "ether"));
    });

    it("is pausable — rejects payouts when paused", async function () {
      const { owner, user, other, pool } = await loadFixture(deployPool);
      const PAYOUT_ROLE = await pool.PAYOUT_ROLE();
      await pool.grantRole(PAYOUT_ROLE, await user.getAddress());
      await pool.deposit(ASSET, { value: parseUnits("10", "ether") });

      await pool.connect(owner).pause();

      await expect(
        pool.connect(user).payout(ASSET, await other.getAddress(), parseUnits("1", "ether"))
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("pause() / unpause()", function () {
    it("owner can pause and unpause", async function () {
      const { owner, user, pool } = await loadFixture(deployPool);

      await pool.connect(owner).pause();
      await expect(
        pool.connect(user).deposit(ASSET, { value: parseUnits("1", "ether") })
      ).to.be.revertedWith("Pausable: paused");

      await pool.connect(owner).unpause();
      await pool.connect(user).deposit(ASSET, { value: parseUnits("1", "ether") }); // should not revert
    });

    it("non-owner cannot pause", async function () {
      const { user, pool } = await loadFixture(deployPool);
      await expect(pool.connect(user).pause())
        .to.be.revertedWith("AccessControl");
    });
  });

  describe("getBalance()", function () {
    it("returns correct balance for asset", async function () {
      const { user, pool } = await loadFixture(deployPool);
      await pool.deposit(ASSET, { value: parseUnits("7", "ether") });
      expect(await pool.getBalance(ASSET)).to.equal(parseUnits("7", "ether"));
    });

    it("returns 0 for assets never deposited", async function () {
      const { pool } = await loadFixture(deployPool);
      expect(await pool.getBalance(ethers.ZeroAddress)).to.equal(0);
    });
  });
});
