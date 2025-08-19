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
