
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// ==============================================
// COMMIT 1: BASIC CONTRACT FUNCTIONALITY TESTS
// ==============================================

Clarinet.test({
    name: "Test contract initialization and basic stats",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk().expectTuple(), {
            'contract-active': types.bool(true),
            'total-scholarships': types.uint(0),
            'total-students': types.uint(0),
            'total-distributed': types.uint(0),
            'contract-owner': deployer.address
        });
    },
});

Clarinet.test({
    name: "Test scholarship creation by contract owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300), // 3.0 GPA minimum
                types.uint(5000000), // 5 STX disbursement
                types.uint(90) // 90 days period
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify scholarship was created
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const fundData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundData.balance, types.uint(0));
        assertEquals(fundData['is-active'], types.bool(true));
    },
});

Clarinet.test({
    name: "Test scholarship creation fails for non-owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const nonOwner = accounts.get('wallet_1')!;
        const scholarshipOwner = accounts.get('wallet_2')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], nonOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1001); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Test invalid GPA requirements rejected",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        
        // Test GPA below minimum
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(200), // Below 2.5 minimum
                types.uint(5000000),
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
        
        // Test GPA above maximum
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(450), // Above 4.0 maximum
                types.uint(5000000),
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
    },
});

Clarinet.test({
    name: "Test student registration by contract owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const student = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("John Doe"),
                types.ascii("University of Technology"),
                types.ascii("Computer Science")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify student was registered
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-student-info', [
                types.principal(student.address)
            ], deployer.address)
        ]);
        
        const studentData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(studentData.name, types.ascii("John Doe"));
        assertEquals(studentData.institution, types.ascii("University of Technology"));
        assertEquals(studentData['is-active'], types.bool(true));
        assertEquals(studentData['total-received'], types.uint(0));
    },
});

Clarinet.test({
    name: "Test duplicate student registration fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const student = accounts.get('wallet_1')!;
        
        // Register student first time
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("John Doe"),
                types.ascii("University of Technology"),
                types.ascii("Computer Science")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Try to register same student again
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Jane Doe"),
                types.ascii("Different University"),
                types.ascii("Different Major")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1011); // ERR-STUDENT-ALREADY-EXISTS
    },
});

Clarinet.test({
    name: "Test contract stats update after operations",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Create scholarship and register student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Alice Smith"),
                types.ascii("State University"),
                types.ascii("Mathematics")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
        
        // Check updated stats
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address)
        ]);
        
        const stats = block.receipts[0].result.expectOk().expectTuple() as any;
        assertEquals(stats['total-scholarships'], types.uint(1));
        assertEquals(stats['total-students'], types.uint(1));
        assertEquals(stats['total-distributed'], types.uint(0)); // No distributions yet
    },
});

Clarinet.test({
    name: "Test contract disable/enable functionality",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const nonOwner = accounts.get('wallet_1')!;
        
        // Test non-owner cannot disable contract
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'disable-contract', [], nonOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1001); // ERR-UNAUTHORIZED
        
        // Owner can disable contract
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'disable-contract', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify contract is disabled
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address)
        ]);
        
        const stats = block.receipts[0].result.expectOk().expectTuple() as any;
        assertEquals(stats['contract-active'], types.bool(false));
        
        // Test operations fail when contract is disabled
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(deployer.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1010); // ERR-CONTRACT-DISABLED
        
        // Re-enable contract
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'enable-contract', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify operations work again
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address)
        ]);
        
        const enabledStats = block.receipts[0].result.expectOk().expectTuple() as any;
        assertEquals(enabledStats['contract-active'], types.bool(true));
    },
});

// ==============================================
// COMMIT 2: VERIFICATION SYSTEM TESTS
// ==============================================

Clarinet.test({
    name: "Test verifier management - add and remove verifiers",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier1 = accounts.get('wallet_1')!;
        const verifier2 = accounts.get('wallet_2')!;
        const nonOwner = accounts.get('wallet_3')!;
        
        // Test non-owner cannot add verifiers
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier1.address)
            ], nonOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1001); // ERR-UNAUTHORIZED
        
        // Owner can add verifiers
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier1.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier2.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
        
        // Verify verifiers are added
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'is-verifier-address', [
                types.principal(verifier1.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'is-verifier-address', [
                types.principal(verifier2.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk().expectSome(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk().expectSome(), types.bool(true));
        
        // Owner can remove verifiers
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'remove-verifier', [
                types.principal(verifier1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify verifier is removed
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'is-verifier-address', [
                types.principal(verifier1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.none());
    },
});

Clarinet.test({
    name: "Test academic record updates by verifiers",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const nonVerifier = accounts.get('wallet_3')!;
        
        // Setup: Add verifier and register student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Alice Johnson"),
                types.ascii("Tech University"),
                types.ascii("Engineering")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
        
        // Test non-verifier cannot update academic records
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(350), // 3.5 GPA
                types.uint(45),  // credits
                types.uint(3)    // semester
            ], nonVerifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1001); // ERR-UNAUTHORIZED
        
        // Verifier can update academic records
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(350), // 3.5 GPA
                types.uint(45),  // credits
                types.uint(3)    // semester
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify academic record was updated
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-academic-record', [
                types.principal(student.address)
            ], deployer.address)
        ]);
        
        const academicData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(academicData['current-gpa'], types.uint(350));
        assertEquals(academicData['credits-completed'], types.uint(45));
        assertEquals(academicData.semester, types.uint(3));
    },
});

Clarinet.test({
    name: "Test invalid GPA updates are rejected",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Add verifier and register student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Bob Smith"),
                types.ascii("State College"),
                types.ascii("Mathematics")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // Test GPA below minimum (2.5)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(200), // 2.0 GPA - below minimum
                types.uint(30),
                types.uint(2)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
        
        // Test GPA above maximum (4.0)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(450), // 4.5 GPA - above maximum
                types.uint(30),
                types.uint(2)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
    },
});

Clarinet.test({
    name: "Test academic progress verification system",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier1 = accounts.get('wallet_1')!;
        const verifier2 = accounts.get('wallet_2')!;
        const verifier3 = accounts.get('wallet_3')!;
        const student = accounts.get('wallet_4')!;
        const nonVerifier = accounts.get('wallet_5')!;
        
        // Setup: Add verifiers and register student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier1.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier2.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier3.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Carol Davis"),
                types.ascii("National University"),
                types.ascii("Computer Science")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        
        // Test non-verifier cannot verify academic progress
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], nonVerifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1001); // ERR-UNAUTHORIZED
        
        // First verifier verifies progress
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Check verification count
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-academic-verifications', [
                types.principal(student.address),
                types.uint(1) // period 1
            ], deployer.address)
        ]);
        
        const verifications = block.receipts[0].result.expectOk().expectSome();
        assertEquals(verifications.expectList().length, 1);
        
        // Second and third verifiers verify progress
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier2.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier3.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
        
        // Check updated verification count
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-academic-verifications', [
                types.principal(student.address),
                types.uint(1)
            ], deployer.address)
        ]);
        
        const updatedVerifications = block.receipts[0].result.expectOk().expectSome();
        assertEquals(updatedVerifications.expectList().length, 3);
    },
});

Clarinet.test({
    name: "Test duplicate verification prevention",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Add verifier and register student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("David Wilson"),
                types.ascii("City College"),
                types.ascii("Physics")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // First verification succeeds
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Same verifier cannot verify again for same period
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1009); // ERR-ALREADY-VERIFIED
    },
});

Clarinet.test({
    name: "Test verification for inactive students fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        
        // Setup: Add verifier, register and then deactivate student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Eve Brown"),
                types.ascii("Regional University"),
                types.ascii("Biology")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // Deactivate student
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'deactivate-student', [
                types.principal(student.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Try to verify progress for inactive student
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1004); // ERR-STUDENT-NOT-FOUND
    },
});

Clarinet.test({
    name: "Test updating records for non-existent student fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const verifier = accounts.get('wallet_1')!;
        const nonExistentStudent = accounts.get('wallet_2')!;
        
        // Setup: Add verifier
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Try to update records for non-existent student
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(nonExistentStudent.address),
                types.uint(300),
                types.uint(30),
                types.uint(2)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1004); // ERR-STUDENT-NOT-FOUND
    },
});

// ==============================================
// COMMIT 3: DISBURSEMENT LOGIC TESTS
// ==============================================

Clarinet.test({
    name: "Test scholarship funding functionality",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const funder = accounts.get('wallet_2')!;
        
        // Create scholarship first
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300), // 3.0 GPA
                types.uint(5000000), // 5 STX
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Fund the scholarship
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(20000000) // 20 STX
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify scholarship was funded
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const fundData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundData.balance, types.uint(20000000));
        assertEquals(fundData['total-distributed'], types.uint(0));
        assertEquals(fundData['is-active'], types.bool(true));
    },
});

Clarinet.test({
    name: "Test funding non-existent scholarship fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const nonExistentOwner = accounts.get('wallet_1')!;
        const funder = accounts.get('wallet_2')!;
        
        // Try to fund non-existent scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(nonExistentOwner.address),
                types.uint(10000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1005); // ERR-SCHOLARSHIP-NOT-FOUND
    },
});

Clarinet.test({
    name: "Test scholarship settings update",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        
        // Create scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        
        // Update settings
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-scholarship-settings', [
                types.uint(320), // 3.2 GPA
                types.uint(7500000), // 7.5 STX
                types.uint(120) // 120 days
            ], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify settings were updated
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-settings', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const settings = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(settings['min-gpa'], types.uint(320));
        assertEquals(settings['disbursement-amount'], types.uint(7500000));
        assertEquals(settings['period-days'], types.uint(120));
    },
});

Clarinet.test({
    name: "Test scholarship withdrawal functionality",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const funder = accounts.get('wallet_2')!;
        
        // Create and fund scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(15000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // Withdraw funds
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'withdraw-scholarship-funds', [], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify withdrawal
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const fundData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundData.balance, types.uint(0));
    },
});

Clarinet.test({
    name: "Test disbursement request with proper setup",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier1 = accounts.get('wallet_3')!;
        const verifier2 = accounts.get('wallet_4')!;
        const verifier3 = accounts.get('wallet_5')!;
        const funder = accounts.get('wallet_6')!;
        
        // Setup: Create scholarship, register student, add verifiers
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300), // 3.0 GPA minimum
                types.uint(5000000), // 5 STX disbursement
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Jane Scholar"),
                types.ascii("Excellence University"),
                types.ascii("Data Science")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier1.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier2.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier3.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 5);
        
        // Fund scholarship
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(20000000) // 20 STX
            ], funder.address)
        ]);
        
        // Update academic records with good GPA
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(350), // 3.5 GPA - above minimum
                types.uint(60),
                types.uint(4)
            ], verifier1.address)
        ]);
        
        // Get required verifications (need 3)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier1.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier2.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier3.address)
        ]);
        
        assertEquals(block.receipts.length, 3);
        
        // Request disbursement
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Verify student received funds
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-student-info', [
                types.principal(student.address)
            ], deployer.address)
        ]);
        
        const studentData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(studentData['total-received'], types.uint(5000000));
    },
});

Clarinet.test({
    name: "Test disbursement fails with insufficient GPA",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier = accounts.get('wallet_3')!;
        const funder = accounts.get('wallet_4')!;
        
        // Setup: Create scholarship requiring 3.0 GPA
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300), // 3.0 GPA minimum
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Low GPA Student"),
                types.ascii("State University"),
                types.ascii("Liberal Arts")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(10000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        
        // Update with low GPA (below requirement)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(280), // 2.8 GPA - below 3.0 minimum
                types.uint(45),
                types.uint(3)
            ], verifier.address)
        ]);
        
        // Try disbursement with low GPA
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
    },
});

Clarinet.test({
    name: "Test disbursement fails with insufficient verifications",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier = accounts.get('wallet_3')!;
        const funder = accounts.get('wallet_4')!;
        
        // Setup: Create funded scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Good Student"),
                types.ascii("Tech College"),
                types.ascii("Engineering")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(10000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        
        // Update with good GPA
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(370), // 3.7 GPA - good
                types.uint(75),
                types.uint(5)
            ], verifier.address)
        ]);
        
        // Only 1 verification (need 3)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier.address)
        ]);
        
        // Try disbursement with insufficient verifications
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1008); // ERR-INSUFFICIENT-VERIFICATIONS
    },
});

Clarinet.test({
    name: "Test can-request-disbursement read-only function",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier = accounts.get('wallet_3')!;
        
        // Setup basic scholarship and student
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Test Student"),
                types.ascii("Test University"),
                types.ascii("Test Major")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 3);
        
        // Check initial state - should be false (no funding, no GPA, no verifications)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'can-request-disbursement', [
                types.principal(student.address),
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(false));
        
        // Fund scholarship and update GPA
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(10000000)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(350),
                types.uint(30),
                types.uint(2)
            ], verifier.address)
        ]);
        
        // Should be true now (all requirements met except verifications)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'can-request-disbursement', [
                types.principal(student.address),
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
    },
});

// ==============================================
// COMMIT 4: ADVANCED EDGE CASES AND INTEGRATION
// ==============================================

Clarinet.test({
    name: "Test scholarship deactivation and activation",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const funder = accounts.get('wallet_2')!;
        
        // Create and fund scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(10000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // Deactivate scholarship
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'deactivate-scholarship', [], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Try to fund deactivated scholarship
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(5000000)
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1005); // ERR-SCHOLARSHIP-NOT-FOUND
    },
});

Clarinet.test({
    name: "Test multiple students with same scholarship",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student1 = accounts.get('wallet_2')!;
        const student2 = accounts.get('wallet_3')!;
        const verifier = accounts.get('wallet_4')!;
        const funder = accounts.get('wallet_5')!;
        
        // Setup: Create scholarship, register students, add verifier
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(3000000), // 3 STX per disbursement
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student1.address),
                types.ascii("Student One"),
                types.ascii("University A"),
                types.ascii("Major A")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student2.address),
                types.ascii("Student Two"),
                types.ascii("University B"),
                types.ascii("Major B")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(10000000) // 10 STX
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 5);
        
        // Update academic records for both students
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student1.address),
                types.uint(350), // 3.5 GPA
                types.uint(60),
                types.uint(4)
            ], verifier.address),
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student2.address),
                types.uint(380), // 3.8 GPA
                types.uint(75),
                types.uint(5)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        
        // First student gets disbursement
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student1.address)
            ], verifier.address)
        ]);
        
        // Cannot make disbursement yet (need 3 verifications, but we only have 1 verifier)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student1.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1008); // ERR-INSUFFICIENT-VERIFICATIONS
        
        // Check scholarship fund remains unchanged
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const fundData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundData.balance, types.uint(10000000)); // Still 10 STX
    },
});

Clarinet.test({
    name: "Test invalid amount boundaries",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const funder = accounts.get('wallet_2')!;
        
        // Test creating scholarship with amount below minimum
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(500000), // 0.5 STX - below 1 STX minimum
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
        
        // Test creating scholarship with amount above maximum
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(1500000000), // 1500 STX - above 1000 STX maximum
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
        
        // Test funding with amount below minimum
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000), // Valid amount
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(500000) // 0.5 STX - below minimum
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
    },
});

Clarinet.test({
    name: "Test contract state changes during disabled state",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier = accounts.get('wallet_3')!;
        
        // Setup some data first
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Test Student"),
                types.ascii("Test University"),
                types.ascii("Test Major")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 3);
        
        // Disable contract
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'disable-contract', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Test all major functions fail when disabled
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(5000000)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(350),
                types.uint(30),
                types.uint(2)
            ], verifier.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier.address),
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        // All should fail with contract disabled error
        for (let i = 0; i < 4; i++) {
            block.receipts[i].result.expectErr().expectUint(1010); // ERR-CONTRACT-DISABLED
        }
        
        // Read-only functions should still work
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'get-student-info', [
                types.principal(student.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
    },
});

Clarinet.test({
    name: "Test scholarship settings validation",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        
        // Create scholarship
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        
        // Test invalid GPA in settings update
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-scholarship-settings', [
                types.uint(200), // Invalid GPA - below minimum
                types.uint(5000000),
                types.uint(90)
            ], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1006); // ERR-INVALID-GPA
        
        // Test invalid amount in settings update
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-scholarship-settings', [
                types.uint(300),
                types.uint(500000), // Invalid amount - below minimum
                types.uint(90)
            ], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
        
        // Test invalid period in settings update
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-scholarship-settings', [
                types.uint(300),
                types.uint(5000000),
                types.uint(0) // Invalid period - zero days
            ], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
    },
});

Clarinet.test({
    name: "Test comprehensive integration scenario",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier1 = accounts.get('wallet_3')!;
        const verifier2 = accounts.get('wallet_4')!;
        const verifier3 = accounts.get('wallet_5')!;
        const funder = accounts.get('wallet_6')!;
        
        // Step 1: Complete setup
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(4000000), // 4 STX per disbursement
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii("Integration Student"),
                types.ascii("Integration University"),
                types.ascii("Integration Major")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier1.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier2.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier3.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(20000000) // 20 STX
            ], funder.address)
        ]);
        
        assertEquals(block.receipts.length, 6);
        
        // Step 2: Academic progress cycle
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student.address),
                types.uint(360), // 3.6 GPA
                types.uint(45),
                types.uint(3)
            ], verifier1.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier1.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier2.address),
            Tx.contractCall('Block-scholar-contract', 'verify-academic-progress', [
                types.principal(student.address)
            ], verifier3.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        
        // Step 3: Successful disbursement
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'request-disbursement', [
                types.principal(scholarshipOwner.address)
            ], student.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Step 4: Verify state changes
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-student-info', [
                types.principal(student.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'get-contract-stats', [], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 3);
        
        // Verify student received funds
        const studentInfo = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(studentInfo['total-received'], types.uint(4000000)); // 4 STX received
        
        // Verify scholarship balance reduced
        const fundInfo = block.receipts[1].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundInfo.balance, types.uint(16000000)); // 16 STX remaining
        assertEquals(fundInfo['total-distributed'], types.uint(4000000)); // 4 STX distributed
        
        // Verify contract stats updated
        const stats = block.receipts[2].result.expectOk().expectTuple() as any;
        assertEquals(stats['total-distributed'], types.uint(4000000)); // Global distribution stat
    },
});

Clarinet.test({
    name: "Test error handling with malformed data",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student = accounts.get('wallet_2')!;
        const verifier = accounts.get('wallet_3')!;
        
        // Test empty string inputs for student registration
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student.address),
                types.ascii(""), // Empty name
                types.ascii("University"),
                types.ascii("Major")
            ], deployer.address)
        ]);
        
        // This should still succeed as the contract doesn't validate string content
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Test edge case GPA values (boundary conditions)
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(250), // Exactly at minimum GPA (2.5)
                types.uint(1000000), // Exactly at minimum amount (1 STX)
                types.uint(1) // Minimum period (1 day)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
        
        // Test maximum boundary values
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-scholarship-settings', [
                types.uint(400), // Exactly at maximum GPA (4.0)
                types.uint(1000000000), // Exactly at maximum amount (1000 STX)
                types.uint(365) // One year period
            ], scholarshipOwner.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk();
    },
});

Clarinet.test({
    name: "Test concurrent operations and race conditions",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const scholarshipOwner = accounts.get('wallet_1')!;
        const student1 = accounts.get('wallet_2')!;
        const student2 = accounts.get('wallet_3')!;
        const verifier = accounts.get('wallet_4')!;
        const funder1 = accounts.get('wallet_5')!;
        const funder2 = accounts.get('wallet_6')!;
        
        // Setup
        let block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'create-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(300),
                types.uint(5000000),
                types.uint(90)
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student1.address),
                types.ascii("Student One"),
                types.ascii("University One"),
                types.ascii("Major One")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'register-student', [
                types.principal(student2.address),
                types.ascii("Student Two"),
                types.ascii("University Two"),
                types.ascii("Major Two")
            ], deployer.address),
            Tx.contractCall('Block-scholar-contract', 'add-verifier', [
                types.principal(verifier.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        
        // Test concurrent funding - multiple funders in same block
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(8000000) // 8 STX
            ], funder1.address),
            Tx.contractCall('Block-scholar-contract', 'fund-scholarship', [
                types.principal(scholarshipOwner.address),
                types.uint(7000000) // 7 STX
            ], funder2.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
        
        // Verify total funding
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'get-scholarship-fund', [
                types.principal(scholarshipOwner.address)
            ], deployer.address)
        ]);
        
        const fundData = block.receipts[0].result.expectOk().expectSome().expectTuple() as any;
        assertEquals(fundData.balance, types.uint(15000000)); // 15 STX total
        
        // Test concurrent academic updates
        block = chain.mineBlock([
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student1.address),
                types.uint(350),
                types.uint(45),
                types.uint(3)
            ], verifier.address),
            Tx.contractCall('Block-scholar-contract', 'update-academic-record', [
                types.principal(student2.address),
                types.uint(380),
                types.uint(50),
                types.uint(3)
            ], verifier.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();
    },
});
