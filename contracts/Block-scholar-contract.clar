;; BlockScholar - Scholarship Distribution Contract
;; A smart contract that releases funds to students based on verified academic progress
;; Built on Stacks blockchain using Clarity language

;; Constants
(define-constant CONTRACT-OWNER (as-contract tx-sender))
(define-constant MIN-SCHOLARSHIP-AMOUNT u1000000) ;; 1 STX minimum
(define-constant MAX-SCHOLARSHIP-AMOUNT u1000000000) ;; 1000 STX maximum
(define-constant MIN-GPA-REQUIREMENT u250) ;; 2.5 GPA minimum (scaled by 100)
(define-constant MAX-GPA-SCALE u400) ;; 4.0 GPA maximum (scaled by 100)
(define-constant VERIFICATION-THRESHOLD u3) ;; Minimum verifications needed
(define-constant ACADEMIC-PERIOD-DAYS u90) ;; 90 days between disbursements

;; Error codes
(define-constant ERR-UNAUTHORIZED u1001)
(define-constant ERR-INSUFFICIENT-FUNDS u1002)
(define-constant ERR-INVALID-AMOUNT u1003)
(define-constant ERR-STUDENT-NOT-FOUND u1004)
(define-constant ERR-SCHOLARSHIP-NOT-FOUND u1005)
(define-constant ERR-INVALID-GPA u1006)
(define-constant ERR-PERIOD-NOT-ELAPSED u1007)
(define-constant ERR-INSUFFICIENT-VERIFICATIONS u1008)
(define-constant ERR-ALREADY-VERIFIED u1009)
(define-constant ERR-CONTRACT-DISABLED u1010)

;; Data maps and variables
;; Scholarship fund management
(define-map scholarship-funds (principal) (tuple (balance uint) (total-distributed uint) (is-active bool)))
(define-map scholarship-settings (principal) (tuple (min-gpa uint) (disbursement-amount uint) (period-days uint)))

;; Student management
(define-map students (principal) (tuple 
    (name (string-ascii 100)) 
    (institution (string-ascii 200)) 
    (major (string-ascii 100)) 
    (enrollment-date uint) 
    (is-active bool)
    (total-received uint)
    (last-disbursement uint)
))

;; Academic progress tracking
(define-map academic-records (principal) (tuple 
    (current-gpa uint) 
    (credits-completed uint) 
    (semester uint) 
    (last-updated uint)
))

;; Verification system
(define-map verifiers (principal) bool)
(define-map academic-verifications (tuple (student principal) (period uint)) (list principal))

;; Contract state
(define-data-var contract-active bool true)
(define-data-var total-scholarships-created uint u0)
(define-data-var total-students-registered uint u0)
(define-data-var total-funds-distributed uint u0)

;; Private functions
;; Helper function to check if caller is contract owner
(define-private (is-owner (caller principal))
    (is-eq caller CONTRACT-OWNER)
)

;; Helper function to check if caller is a verifier
(define-private (is-verifier (caller principal))
    (default-to false (map-get? verifiers caller))
)

;; Helper function to validate GPA
(define-private (is-valid-gpa (gpa uint))
    (and (>= gpa MIN-GPA-REQUIREMENT) (<= gpa MAX-GPA-SCALE))
)

;; Helper function to validate scholarship amount
(define-private (is-valid-amount (amount uint))
    (and (>= amount MIN-SCHOLARSHIP-AMOUNT) (<= amount MAX-SCHOLARSHIP-AMOUNT))
)

;; Helper function to check if academic period has elapsed
(define-private (can-disburse (student principal))
    (let ((student-data (unwrap! (map-get? students student) (err ERR-STUDENT-NOT-FOUND)))
          (current-block (block-height)))
        (>= (- current-block (get last-disbursement student-data)) ACADEMIC-PERIOD-DAYS)
    )
)

;; Helper function to get current period
(define-private (get-current-period (student principal))
    (let ((student-data (unwrap! (map-get? students student) (err ERR-STUDENT-NOT-FOUND)))
          (current-block (block-height)))
        (/ (- current-block (get last-disbursement student-data)) ACADEMIC-PERIOD-DAYS)
    )
)

;; Public functions - Scholarship Management

;; Create a new scholarship fund
;; Only contract owner can create scholarships
(define-public (create-scholarship (scholarship-owner principal) (min-gpa uint) (disbursement-amount uint) (period-days uint))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Validate parameters
        (asserts (is-valid-gpa min-gpa) (err ERR-INVALID-GPA))
        (asserts (is-valid-amount disbursement-amount) (err ERR-INVALID-AMOUNT))
        (asserts (> period-days u0) (err ERR-INVALID-AMOUNT))
        
        ;; Initialize scholarship fund
        (map-set scholarship-funds scholarship-owner (tuple 
            (balance u0) 
            (total-distributed u0) 
            (is-active true)
        ))
        
        ;; Set scholarship settings
        (map-set scholarship-settings scholarship-owner (tuple 
            (min-gpa min-gpa) 
            (disbursement-amount disbursement-amount) 
            (period-days period-days)
        ))
        
        ;; Update contract state
        (var-set total-scholarships-created (+ (var-get total-scholarships-created) u1))
        
        (ok (tuple 
            (scholarship-owner scholarship-owner)
            (min-gpa min-gpa)
            (disbursement-amount disbursement-amount)
            (period-days period-days)
        ))
    )
)

;; Fund a scholarship with STX
;; Anyone can fund a scholarship
(define-public (fund-scholarship (scholarship-owner principal) (amount uint))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Validate amount
        (asserts (is-valid-amount amount) (err ERR-INVALID-AMOUNT))
        
        ;; Check if scholarship exists
        (let ((fund-data (unwrap! (map-get? scholarship-funds scholarship-owner) (err ERR-SCHOLARSHIP-NOT-FOUND))))
            (asserts (get is-active fund-data) (err ERR-SCHOLARSHIP-NOT-FOUND))
            
            ;; Update scholarship balance
            (map-set scholarship-funds scholarship-owner (tuple 
                (balance (+ (get balance fund-data) amount))
                (total-distributed (get total-distributed fund-data))
                (is-active (get is-active fund-data))
            ))
            
            (ok (tuple 
                (scholarship-owner scholarship-owner)
                (new-balance (+ (get balance fund-data) amount))
                (amount amount)
            ))
        )
    )
)

;; Update scholarship settings
;; Only scholarship owner can update settings
(define-public (update-scholarship-settings (min-gpa uint) (disbursement-amount uint) (period-days uint))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller owns a scholarship
        (let ((fund-data (unwrap! (map-get? scholarship-funds tx-sender) (err ERR-SCHOLARSHIP-NOT-FOUND))))
            (asserts (get is-active fund-data) (err ERR-SCHOLARSHIP-NOT-FOUND))
            
            ;; Validate parameters
            (asserts (is-valid-gpa min-gpa) (err ERR-INVALID-GPA))
            (asserts (is-valid-amount disbursement-amount) (err ERR-INVALID-AMOUNT))
            (asserts (> period-days u0) (err ERR-INVALID-AMOUNT))
            
            ;; Update settings
            (map-set scholarship-settings tx-sender (tuple 
                (min-gpa min-gpa) 
                (disbursement-amount disbursement-amount) 
                (period-days period-days)
            ))
            
            (ok (tuple 
                (scholarship-owner tx-sender)
                (min-gpa min-gpa)
                (disbursement-amount disbursement-amount)
                (period-days period-days)
            ))
        )
    )
)

;; Deactivate a scholarship
;; Only scholarship owner can deactivate
(define-public (deactivate-scholarship)
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller owns a scholarship
        (let ((fund-data (unwrap! (map-get? scholarship-funds tx-sender) (err ERR-SCHOLARSHIP-NOT-FOUND))))
            (asserts (get is-active fund-data) (err ERR-SCHOLARSHIP-NOT-FOUND))
            
            ;; Deactivate scholarship
            (map-set scholarship-funds tx-sender (tuple 
                (balance (get balance fund-data))
                (total-distributed (get total-distributed fund-data))
                (is-active false)
            ))
            
            (ok (tuple 
                (scholarship-owner tx-sender)
                (is-active false)
            ))
        )
    )
)

;; Withdraw remaining funds from scholarship
;; Only scholarship owner can withdraw
(define-public (withdraw-scholarship-funds)
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller owns a scholarship
        (let ((fund-data (unwrap! (map-get? scholarship-funds tx-sender) (err ERR-SCHOLARSHIP-NOT-FOUND))))
            (asserts (get is-active fund-data) (err ERR-SCHOLARSHIP-NOT-FOUND))
            
            (let ((balance (get balance fund-data)))
                (asserts (> balance u0) (err ERR-INSUFFICIENT-FUNDS))
                
                ;; Transfer funds to owner
                (try! (stx-transfer? balance tx-sender tx-sender))
                
                ;; Update scholarship balance
                (map-set scholarship-funds tx-sender (tuple 
                    (balance u0)
                    (total-distributed (get total-distributed fund-data))
                    (is-active (get is-active fund-data))
                ))
                
                (ok (tuple 
                    (scholarship-owner tx-sender)
                    (withdrawn-amount balance)
                ))
            )
        )
    )
)

;; Public functions - Student Management

;; Register a new student
;; Only contract owner can register students
(define-public (register-student (student principal) (name (string-ascii 100)) (institution (string-ascii 200)) (major (string-ascii 100)))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Check if student already exists
        (asserts (not (map-get? students student)) (err ERR-STUDENT-NOT-FOUND))
        
        ;; Register student
        (map-set students student (tuple 
            (name name)
            (institution institution)
            (major major)
            (enrollment-date (block-height))
            (is-active true)
            (total-received u0)
            (last-disbursement (block-height))
        ))
        
        ;; Initialize academic record
        (map-set academic-records student (tuple 
            (current-gpa u0)
            (credits-completed u0)
            (semester u0)
            (last-updated (block-height))
        ))
        
        ;; Update contract state
        (var-set total-students-registered (+ (var-get total-students-registered) u1))
        
        (ok (tuple 
            (student student)
            (name name)
            (institution institution)
            (major major)
            (enrollment-date (block-height))
        ))
    )
)

;; Update student academic record
;; Only verifiers can update academic records
(define-public (update-academic-record (student principal) (gpa uint) (credits uint) (semester uint))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is a verifier
        (asserts (is-verifier tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Check if student exists
        (let ((student-data (unwrap! (map-get? students student) (err ERR-STUDENT-NOT-FOUND))))
            (asserts (get is-active student-data) (err ERR-STUDENT-NOT-FOUND))
            
            ;; Validate GPA
            (asserts (is-valid-gpa gpa) (err ERR-INVALID-GPA))
            
            ;; Update academic record
            (map-set academic-records student (tuple 
                (current-gpa gpa)
                (credits-completed credits)
                (semester semester)
                (last-updated (block-height))
            ))
            
            (ok (tuple 
                (student student)
                (gpa gpa)
                (credits credits)
                (semester semester)
                (updated-by tx-sender)
            ))
        )
    )
)

;; Deactivate a student
;; Only contract owner can deactivate students
(define-public (deactivate-student (student principal))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Check if student exists
        (let ((student-data (unwrap! (map-get? students student) (err ERR-STUDENT-NOT-FOUND))))
            (asserts (get is-active student-data) (err ERR-STUDENT-NOT-FOUND))
            
            ;; Deactivate student
            (map-set students student (tuple 
                (name (get name student-data))
                (institution (get institution student-data))
                (major (get major student-data))
                (enrollment-date (get enrollment-date student-data))
                (is-active false)
                (total-received (get total-received student-data))
                (last-disbursement (get last-disbursement student-data))
            ))
            
            (ok (tuple 
                (student student)
                (is-active false)
            ))
        )
    )
)

;; Public functions - Verification System

;; Add a verifier
;; Only contract owner can add verifiers
(define-public (add-verifier (verifier principal))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Add verifier
        (map-set verifiers verifier true)
        
        (ok (tuple 
            (verifier verifier)
            (added-by tx-sender)
        ))
    )
)

;; Remove a verifier
;; Only contract owner can remove verifiers
(define-public (remove-verifier (verifier principal))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Remove verifier
        (map-delete verifiers verifier)
        
        (ok (tuple 
            (verifier verifier)
            (removed-by tx-sender)
        ))
    )
)

;; Verify academic progress for a student
;; Only verifiers can verify academic progress
(define-public (verify-academic-progress (student principal))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if caller is a verifier
        (asserts (is-verifier tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Check if student exists and is active
        (let ((student-data (unwrap! (map-get? students student) (err ERR-STUDENT-NOT-FOUND))))
            (asserts (get is-active student-data) (err ERR-STUDENT-NOT-FOUND))
            
            (let ((current-period (get-current-period student))
                  (verification-key (tuple (student student) (period current-period)))
                  (existing-verifications (default-to (list) (map-get? academic-verifications verification-key))))
                
                ;; Check if verifier already verified this period
                (asserts (not (contains? existing-verifications tx-sender)) (err ERR-ALREADY-VERIFIED))
                
                ;; Add verification
                (map-set academic-verifications verification-key (append existing-verifications (list tx-sender)))
                
                (ok (tuple 
                    (student student)
                    (period current-period)
                    (verifier tx-sender)
                    (total-verifications (+ (len existing-verifications) u1))
                ))
            )
        )
    )
)

;; Public functions - Scholarship Disbursement

;; Request scholarship disbursement
;; Students can request disbursement if they meet requirements
(define-public (request-disbursement (scholarship-owner principal))
    (begin
        ;; Check if contract is active
        (asserts (var-get contract-active) (err ERR-CONTRACT-DISABLED))
        
        ;; Check if student exists and is active
        (let ((student-data (unwrap! (map-get? students tx-sender) (err ERR-STUDENT-NOT-FOUND))))
            (asserts (get is-active student-data) (err ERR-STUDENT-NOT-FOUND))
            
            ;; Check if scholarship exists and is active
            (let ((fund-data (unwrap! (map-get? scholarship-funds scholarship-owner) (err ERR-SCHOLARSHIP-NOT-FOUND))))
                (asserts (get is-active fund-data) (err ERR-SCHOLARSHIP-NOT-FOUND))
                
                ;; Check if academic period has elapsed
                (asserts (can-disburse tx-sender) (err ERR-PERIOD-NOT-ELAPSED))
                
                ;; Get academic record
                (let ((academic-data (unwrap! (map-get? academic-records tx-sender) (err ERR-STUDENT-NOT-FOUND)))
                      (settings (unwrap! (map-get? scholarship-settings scholarship-owner) (err ERR-SCHOLARSHIP-NOT-FOUND))))
                    
                    ;; Check if GPA meets requirements
                    (asserts (>= (get current-gpa academic-data) (get min-gpa settings)) (err ERR-INVALID-GPA))
                    
                    ;; Check if enough verifications exist
                    (let ((current-period (get-current-period tx-sender))
                          (verification-key (tuple (student tx-sender) (period current-period)))
                          (verifications (default-to (list) (map-get? academic-verifications verification-key))))
                        
                        (asserts (>= (len verifications) VERIFICATION-THRESHOLD) (err ERR-INSUFFICIENT-VERIFICATIONS))
                        
                        ;; Check if sufficient funds are available
                        (let ((disbursement-amount (get disbursement-amount settings)))
                            (asserts (>= (get balance fund-data) disbursement-amount) (err ERR-INSUFFICIENT-FUNDS))
                            
                            ;; Transfer funds to student
                            (try! (stx-transfer? disbursement-amount tx-sender tx-sender))
                            
                            ;; Update scholarship fund
                            (map-set scholarship-funds scholarship-owner (tuple 
                                (balance (- (get balance fund-data) disbursement-amount))
                                (total-distributed (+ (get total-distributed fund-data) disbursement-amount))
                                (is-active (get is-active fund-data))
                            ))
                            
                            ;; Update student record
                            (map-set students tx-sender (tuple 
                                (name (get name student-data))
                                (institution (get institution student-data))
                                (major (get major student-data))
                                (enrollment-date (get enrollment-date student-data))
                                (is-active (get is-active student-data))
                                (total-received (+ (get total-received student-data) disbursement-amount))
                                (last-disbursement (block-height))
                            ))
                            
                            ;; Update contract state
                            (var-set total-funds-distributed (+ (var-get total-funds-distributed) disbursement-amount))
                            
                            (ok (tuple 
                                (student tx-sender)
                                (scholarship-owner scholarship-owner)
                                (amount disbursement-amount)
                                (period current-period)
                                (total-received (+ (get total-received student-data) disbursement-amount))
                            ))
                        )
                    )
                )
            )
        )
    )
)

;; Public functions - Contract Management

;; Disable contract
;; Only contract owner can disable the contract
(define-public (disable-contract)
    (begin
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Disable contract
        (var-set contract-active false)
        
        (ok (tuple 
            (contract-active false)
            (disabled-by tx-sender)
        ))
    )
)

;; Enable contract
;; Only contract owner can enable the contract
(define-public (enable-contract)
    (begin
        ;; Check if caller is owner
        (asserts (is-owner tx-sender) (err ERR-UNAUTHORIZED))
        
        ;; Enable contract
        (var-set contract-active true)
        
        (ok (tuple 
            (contract-active true)
            (enabled-by tx-sender)
        ))
    )
)

;; Read-only functions

;; Get contract statistics
(define-read-only (get-contract-stats)
    (tuple 
        (contract-active (var-get contract-active))
        (total-scholarships (var-get total-scholarships-created))
        (total-students (var-get total-students-registered))
        (total-distributed (var-get total-funds-distributed))
        (contract-owner CONTRACT-OWNER)
    )
)

;; Get student information
(define-read-only (get-student-info (student principal))
    (map-get? students student)
)

;; Get academic record
(define-read-only (get-academic-record (student principal))
    (map-get? academic-records student)
)

;; Get scholarship fund information
(define-read-only (get-scholarship-fund (scholarship-owner principal))
    (map-get? scholarship-funds scholarship-owner)
)

;; Get scholarship settings
(define-read-only (get-scholarship-settings (scholarship-owner principal))
    (map-get? scholarship-settings scholarship-owner)
)

;; Check if address is a verifier
(define-read-only (is-verifier-address (address principal))
    (map-get? verifiers address)
)

;; Get academic verifications for a student and period
(define-read-only (get-academic-verifications (student principal) (period uint))
    (map-get? academic-verifications (tuple (student student) (period period)))
)

;; Check if student can request disbursement
(define-read-only (can-request-disbursement (student principal) (scholarship-owner principal))
    (let ((student-data (map-get? students student))
          (fund-data (map-get? scholarship-funds scholarship-owner))
          (academic-data (map-get? academic-records student))
          (settings (map-get? scholarship-settings scholarship-owner)))
        (if (and student-data fund-data academic-data settings)
            (let ((student-info (unwrap! student-data (err ERR-STUDENT-NOT-FOUND)))
                  (fund-info (unwrap! fund-data (err ERR-SCHOLARSHIP-NOT-FOUND)))
                  (academic-info (unwrap! academic-data (err ERR-STUDENT-NOT-FOUND)))
                  (scholarship-settings (unwrap! settings (err ERR-SCHOLARSHIP-NOT-FOUND))))
                (and 
                    (get is-active student-info)
                    (get is-active fund-info)
                    (>= (get current-gpa academic-info) (get min-gpa scholarship-settings))
                    (>= (get balance fund-info) (get disbursement-amount scholarship-settings))
                    (can-disburse student)
                )
            )
            false
        )
    )
)
