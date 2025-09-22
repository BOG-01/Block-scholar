
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
