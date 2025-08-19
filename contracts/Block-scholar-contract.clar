;; BlockScholar - Scholarship Distribution Contract
;; A smart contract that releases funds to students based on verified academic progress
;; Built on Stacks blockchain using Clarity language

;; --------------------------
;; Constants
;; --------------------------
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MIN-SCHOLARSHIP-AMOUNT u1000000)       ;; 1 STX minimum
(define-constant MAX-SCHOLARSHIP-AMOUNT u1000000000)    ;; 1000 STX maximum
(define-constant MIN-GPA-REQUIREMENT u250)              ;; 2.5 GPA minimum (scaled by 100)
(define-constant MAX-GPA-SCALE u400)                    ;; 4.0 GPA maximum (scaled by 100)
(define-constant VERIFICATION-THRESHOLD u3)             ;; Minimum verifications needed
(define-constant ACADEMIC-PERIOD-DAYS u90)              ;; 90 days between disbursements

;; --------------------------
;; Error codes
;; --------------------------
(define-constant ERR-UNAUTHORIZED (err u1001))
(define-constant ERR-INSUFFICIENT-FUNDS (err u1002))
(define-constant ERR-INVALID-AMOUNT (err u1003))
(define-constant ERR-STUDENT-NOT-FOUND (err u1004))
(define-constant ERR-SCHOLARSHIP-NOT-FOUND (err u1005))
(define-constant ERR-INVALID-GPA (err u1006))
(define-constant ERR-PERIOD-NOT-ELAPSED (err u1007))
(define-constant ERR-INSUFFICIENT-VERIFICATIONS (err u1008))
(define-constant ERR-ALREADY-VERIFIED (err u1009))
(define-constant ERR-CONTRACT-DISABLED (err u1010))
(define-constant ERR-STUDENT-ALREADY-EXISTS (err u1011))

;; --------------------------
(define-map scholarship-funds principal (tuple (balance uint) (total-distributed uint) (is-active bool)))
(define-map scholarship-settings principal (tuple (min-gpa uint) (disbursement-amount uint) (period-days uint)))

(define-map students principal (tuple 
    (name (string-ascii 100)) 
    (institution (string-ascii 200)) 
    (major (string-ascii 100)) 
    (enrollment-date uint) 
    (is-active bool)
    (total-received uint)
    (last-disbursement uint)
))

(define-map academic-records principal (tuple 
    (current-gpa uint) 
    (credits-completed uint) 
    (semester uint) 
    (last-updated uint)
))

(define-map verifiers principal bool)
(define-map academic-verifications {student: principal, period: uint} (list 5 principal))

(define-data-var contract-active bool true)
(define-data-var total-scholarships-created uint u0)
(define-data-var total-students-registered uint u0)
(define-data-var total-funds-distributed uint u0)

;; --------------------------
;; Private helpers
;; --------------------------
(define-private (is-owner (caller principal))
  (is-eq caller CONTRACT-OWNER)
)

(define-private (is-verifier (caller principal))
  (default-to false (map-get? verifiers caller))
)

(define-private (is-valid-gpa (gpa uint))
  (and (>= gpa MIN-GPA-REQUIREMENT) (<= gpa MAX-GPA-SCALE))
)

(define-private (is-valid-amount (amount uint))
  (and (>= amount MIN-SCHOLARSHIP-AMOUNT) (<= amount MAX-SCHOLARSHIP-AMOUNT))
)

;; Simplified placeholder period gate: allow if student active
(define-private (can-disburse (student principal))
  (match (map-get? students student)
    student-data (get is-active student-data)
    false
  )
)

;; Simplified period number
(define-private (get-current-period (student principal))
  (match (map-get? students student) student-data u1 u0)
)

(define-private (verifier-already-exists (verifier principal) (verifications (list 5 principal)))
  (is-some (index-of verifications verifier))
)

;; --------------------------
;; Scholarship Management
;; --------------------------
(define-public (create-scholarship (scholarship-owner principal) (min-gpa uint) (disbursement-amount uint) (period-days uint))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)

    (asserts! (is-valid-gpa min-gpa) ERR-INVALID-GPA)
    (asserts! (is-valid-amount disbursement-amount) ERR-INVALID-AMOUNT)
    (asserts! (> period-days u0) ERR-INVALID-AMOUNT)

    (map-set scholarship-funds scholarship-owner (tuple (balance u0) (total-distributed u0) (is-active true)))
    (map-set scholarship-settings scholarship-owner (tuple (min-gpa min-gpa) (disbursement-amount disbursement-amount) (period-days period-days)))

    (var-set total-scholarships-created (+ (var-get total-scholarships-created) u1))

    (ok (tuple
      (scholarship-owner scholarship-owner)
      (min-gpa min-gpa)
      (disbursement-amount disbursement-amount)
      (period-days period-days)))
  )
)

;; Anyone can fund; transfer from sender -> contract principal
(define-public (fund-scholarship (scholarship-owner principal) (amount uint))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-valid-amount amount) ERR-INVALID-AMOUNT)

    ;; transfer STX into contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

    (match (map-get? scholarship-funds scholarship-owner)
      fund-data
        (begin
          (asserts! (get is-active fund-data) ERR-SCHOLARSHIP-NOT-FOUND)
          (let ((new-balance (+ (get balance fund-data) amount)))
            (map-set scholarship-funds scholarship-owner
              (tuple (balance new-balance)
                     (total-distributed (get total-distributed fund-data))
                     (is-active (get is-active fund-data))))
            (ok (tuple (scholarship-owner scholarship-owner) (new-balance new-balance) (amount amount)))))
      ERR-SCHOLARSHIP-NOT-FOUND
    )
  )
)

(define-public (update-scholarship-settings (min-gpa uint) (disbursement-amount uint) (period-days uint))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)

    (match (map-get? scholarship-funds tx-sender)
      fund-data
        (begin
          (asserts! (get is-active fund-data) ERR-SCHOLARSHIP-NOT-FOUND)
          (asserts! (is-valid-gpa min-gpa) ERR-INVALID-GPA)
          (asserts! (is-valid-amount disbursement-amount) ERR-INVALID-AMOUNT)
          (asserts! (> period-days u0) ERR-INVALID-AMOUNT)

          (map-set scholarship-settings tx-sender (tuple
            (min-gpa min-gpa) (disbursement-amount disbursement-amount) (period-days period-days)))

          (ok (tuple
            (scholarship-owner tx-sender)
            (min-gpa min-gpa)
            (disbursement-amount disbursement-amount)
            (period-days period-days))))
      ERR-SCHOLARSHIP-NOT-FOUND
    )
  )
)

(define-public (deactivate-scholarship)
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (match (map-get? scholarship-funds tx-sender)
      fund-data
        (begin
          (asserts! (get is-active fund-data) ERR-SCHOLARSHIP-NOT-FOUND)
          (map-set scholarship-funds tx-sender
            (tuple (balance (get balance fund-data))
                   (total-distributed (get total-distributed fund-data))
                   (is-active false)))
          (ok (tuple (scholarship-owner tx-sender) (is-active false))))
      ERR-SCHOLARSHIP-NOT-FOUND
    )
  )
)

(define-public (withdraw-scholarship-funds)
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (match (map-get? scholarship-funds tx-sender)
      fund-data
        (begin
          (asserts! (get is-active fund-data) ERR-SCHOLARSHIP-NOT-FOUND)
          (let ((balance (get balance fund-data))
                (owner tx-sender))
            (asserts! (> balance u0) ERR-INSUFFICIENT-FUNDS)
            ;; contract -> owner (must run inside as-contract so the contract can spend)
            (try! (as-contract (stx-transfer? balance tx-sender owner)))

            (map-set scholarship-funds owner
              (tuple (balance u0)
                     (total-distributed (get total-distributed fund-data))
                     (is-active (get is-active fund-data))))

            (ok (tuple (scholarship-owner owner) (withdrawn-amount balance)))))
      ERR-SCHOLARSHIP-NOT-FOUND
    )
  )
)

;; --------------------------
;; Student Management
;; --------------------------
(define-public (register-student (student principal) (name (string-ascii 100)) (institution (string-ascii 200)) (major (string-ascii 100)))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none (map-get? students student)) ERR-STUDENT-ALREADY-EXISTS)

    (map-set students student (tuple
      (name name) (institution institution) (major major)
      (enrollment-date block-height) (is-active true)
      (total-received u0) (last-disbursement u0)))

    (map-set academic-records student (tuple
      (current-gpa u0) (credits-completed u0) (semester u0) (last-updated block-height)))

    (var-set total-students-registered (+ (var-get total-students-registered) u1))

    (ok (tuple (student student) (name name) (institution institution) (major major) (enrollment-date block-height)))
  )
)

(define-public (update-academic-record (student principal) (gpa uint) (credits uint) (semester uint))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-verifier tx-sender) ERR-UNAUTHORIZED)

    (match (map-get? students student)
      student-data
        (begin
          (asserts! (get is-active student-data) ERR-STUDENT-NOT-FOUND)
          (asserts! (is-valid-gpa gpa) ERR-INVALID-GPA)

          (map-set academic-records student (tuple
            (current-gpa gpa) (credits-completed credits) (semester semester) (last-updated block-height)))

          (ok (tuple (student student) (gpa gpa) (credits credits) (semester semester) (updated-by tx-sender))))
      ERR-STUDENT-NOT-FOUND
    )
  )
)

(define-public (deactivate-student (student principal))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)

    (match (map-get? students student)
      student-data
        (begin
          (asserts! (get is-active student-data) ERR-STUDENT-NOT-FOUND)
          (map-set students student (tuple 
            (name (get name student-data))
            (institution (get institution student-data))
            (major (get major student-data))
            (enrollment-date (get enrollment-date student-data))
            (is-active false)
            (total-received (get total-received student-data))
            (last-disbursement (get last-disbursement student-data))))
          (ok (tuple (student student) (is-active false))))
      ERR-STUDENT-NOT-FOUND
    )
  )
)

;; --------------------------
;; Verification System
;; --------------------------
(define-public (add-verifier (verifier principal))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)
    (map-set verifiers verifier true)
    (ok (tuple (verifier verifier) (added-by tx-sender)))
  )
)

(define-public (remove-verifier (verifier principal))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)
    (map-delete verifiers verifier)
    (ok (tuple (verifier verifier) (removed-by tx-sender)))
  )
)

(define-public (verify-academic-progress (student principal))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)
    (asserts! (is-verifier tx-sender) ERR-UNAUTHORIZED)

    (match (map-get? students student)
      student-data
        (begin
          (asserts! (get is-active student-data) ERR-STUDENT-NOT-FOUND)
          (let (
            (current-period (get-current-period student))
            (verification-key {student: student, period: current-period})
            ;; produce a correctly-typed empty list (list 5 principal) via as-max-len?
            (empty-verify-list (unwrap-panic (as-max-len? (list) u5)))
            (existing-verifications (default-to empty-verify-list (map-get? academic-verifications verification-key)))
          )
            (asserts! (not (verifier-already-exists tx-sender existing-verifications)) ERR-ALREADY-VERIFIED)
            (asserts! (< (len existing-verifications) u5) ERR-INSUFFICIENT-VERIFICATIONS)

            (map-set academic-verifications verification-key
              (unwrap! (as-max-len? (append existing-verifications tx-sender) u5) ERR-INSUFFICIENT-VERIFICATIONS))

            (ok (tuple
              (student student)
              (period current-period)
              (verifier tx-sender)
              (total-verifications (+ (len existing-verifications) u1)))))
        )
      ERR-STUDENT-NOT-FOUND
    )
  )
)

;; --------------------------
;; Scholarship Disbursement
;; --------------------------
(define-public (request-disbursement (scholarship-owner principal))
  (begin
    (asserts! (var-get contract-active) ERR-CONTRACT-DISABLED)

    (match (map-get? students tx-sender)
      student-data
        (begin
          (asserts! (get is-active student-data) ERR-STUDENT-NOT-FOUND)

          (match (map-get? scholarship-funds scholarship-owner)
            fund-data
              (begin
                (asserts! (get is-active fund-data) ERR-SCHOLARSHIP-NOT-FOUND)
                (asserts! (can-disburse tx-sender) ERR-PERIOD-NOT-ELAPSED)

                (match (map-get? academic-records tx-sender)
                  academic-data
                    (begin
                      (match (map-get? scholarship-settings scholarship-owner)
                        settings
                          (begin
                            (asserts! (>= (get current-gpa academic-data) (get min-gpa settings)) ERR-INVALID-GPA)

                            (let (
                              (current-period (get-current-period tx-sender))
                              (verification-key {student: tx-sender, period: current-period})
                              (empty-verify-list (unwrap-panic (as-max-len? (list) u5)))
                              (verifications (default-to empty-verify-list (map-get? academic-verifications verification-key)))
                              (disbursement-amount (get disbursement-amount settings)) ;; FIX: use `settings`
                              (recipient tx-sender)
                            )
                              (asserts! (>= (get balance fund-data) disbursement-amount) ERR-INSUFFICIENT-FUNDS)
                              (asserts! (>= (len verifications) VERIFICATION-THRESHOLD) ERR-INSUFFICIENT-VERIFICATIONS)

                              ;; Contract pays the student (must be inside as-contract)
                              (try! (as-contract (stx-transfer? disbursement-amount tx-sender recipient)))

                              (map-set scholarship-funds scholarship-owner
                                (tuple (balance (- (get balance fund-data) disbursement-amount))
                                       (total-distributed (+ (get total-distributed fund-data) disbursement-amount))
                                       (is-active (get is-active fund-data))))

                              (map-set students recipient
                                (tuple (name (get name student-data))
                                       (institution (get institution student-data))
                                       (major (get major student-data))
                                       (enrollment-date (get enrollment-date student-data))
                                       (is-active (get is-active student-data))
                                       (total-received (+ (get total-received student-data) disbursement-amount))
                                       (last-disbursement block-height)))

                              (var-set total-funds-distributed (+ (var-get total-funds-distributed) disbursement-amount))

                              (ok (tuple
                                (student recipient)
                                (scholarship-owner scholarship-owner)
                                (amount disbursement-amount)
                                (period current-period)
                                (total-received (+ (get total-received student-data) disbursement-amount)))))
                          )
                        ERR-SCHOLARSHIP-NOT-FOUND
                      )
                    )
                  ERR-STUDENT-NOT-FOUND
                )
              )
            ERR-SCHOLARSHIP-NOT-FOUND
          )
        )
      ERR-STUDENT-NOT-FOUND
    )
  )
)

;; --------------------------
;; Contract Management
;; --------------------------
(define-public (disable-contract)
  (begin
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)
    (var-set contract-active false)
    (ok (tuple (contract-active false) (disabled-by tx-sender)))
  )
)

(define-public (enable-contract)
  (begin
    (asserts! (is-owner tx-sender) ERR-UNAUTHORIZED)
    (var-set contract-active true)
    (ok (tuple (contract-active true) (enabled-by tx-sender)))
  )
)

;; --------------------------
;; Read-onlys
;; --------------------------
(define-read-only (get-contract-stats)
  (ok (tuple 
    (contract-active (var-get contract-active))
    (total-scholarships (var-get total-scholarships-created))
    (total-students (var-get total-students-registered))
    (total-distributed (var-get total-funds-distributed))
    (contract-owner CONTRACT-OWNER)))
)

(define-read-only (get-student-info (student principal))
  (ok (map-get? students student))
)

(define-read-only (get-academic-record (student principal))
  (ok (map-get? academic-records student))
)

(define-read-only (get-scholarship-fund (scholarship-owner principal))
  (ok (map-get? scholarship-funds scholarship-owner))
)

(define-read-only (get-scholarship-settings (scholarship-owner principal))
  (ok (map-get? scholarship-settings scholarship-owner))
)

(define-read-only (is-verifier-address (address principal))
  (ok (map-get? verifiers address))
)

(define-read-only (get-academic-verifications (student principal) (period uint))
  (ok (map-get? academic-verifications {student: student, period: period}))
)

(define-read-only (can-request-disbursement (student principal) (scholarship-owner principal))
  (let (
    (student-data (map-get? students student))
    (fund-data (map-get? scholarship-funds scholarship-owner))
    (academic-data (map-get? academic-records student))
    (settings (map-get? scholarship-settings scholarship-owner)))
    (match student-data
      student-info 
      (match fund-data
        fund-info 
        (match academic-data
          academic-info 
          (match settings
            config-data 
            (ok (and 
              (get is-active student-info)
              (get is-active fund-info)
              (>= (get current-gpa academic-info) (get min-gpa config-data))
              (>= (get balance fund-info) (get disbursement-amount config-data))
              (can-disburse student)))
            (ok false))
          (ok false))
        (ok false))
      (ok false)))
)
