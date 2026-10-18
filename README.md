# JCC — Jahir Clearance Certificate Portal

An independent, standardized private background verification and reference screening web application registry operated by Mr. Jahir Narjinary.

> **Statutory Notice:** JCC is a private screening and application assistance registry. It is **not** an official government department, statutory police authority, or law enforcement agency. Credentials issued do not constitute official statutory Police Clearance Certificates (PCC).

---

## 🚀 Key Features

- **Applicant Registration & Authentication:** Secure email/password login and persistent session management powered by Back4App (Parse Platform).
- **Comprehensive Clearance Application:** 
  - Structured personal identity, family particulars, and residence records.
  - Multi-document upload: Passport Photograph, Address Proof, and Other Relevant Verification Documents (PDF).
- **Dynamic UPI Payment Gateway:** 
  - Real-time scannable UPI QR code generation for the fixed ₹100 processing charge.
  - 12-digit UTR reference entry with optional transaction screenshot verification.
- **Administrative Control Panel:**
  - Complete review desk with filtering by status (Draft, Payment Pending, Under Review, Approved, Issued, Rejected).
  - One-click document & PDF inspection.
  - Dynamic UPI configuration tool to update recipient UPI VPA and payee name.
- **Tamper-Evident Certificate Issuance:**
  - Auto-generated cryptographic serial identifiers (`JCC-YYYY-XXXXXX`).
  - High-resolution PDF generation with embedded applicant photograph, dual security borders, and official registry seal.
  - Embedded real-time verification QR code linking directly to public certificate verification.
- **Public Credential Verification:** Instant certificate standing and expiration lookup tool for employers and third parties.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** Vanilla HTML5, CSS3 (Custom Responsive Design System), JavaScript (ES6+ SPA Architecture).
- **Backend as a Service (BaaS):** [Back4App](https://www.back4app.com/) (Parse Platform Engine).
- **Document & File Storage:** Back4App Parse.File Cloud Storage.
- **Client-Side Utilities:**
  - [jsPDF](https://github.com/parallax/jsPDF) — Client-side certificate rendering.
  - [qrcode](https://github.com/davidshimjs/qrcodejs) — Dynamic UPI & certificate validation QR encoding.
- **Hosting:** GitHub Pages.

---

## 📁 Project Structure

```text
├── index.html        # Primary Single Page Application (SPA) structure
├── style.css         # Complete responsive design styling & theme variables
├── app.js            # Frontend logic, Back4App API bindings, QR & PDF generator
└── README.md         # Documentation & setup guide