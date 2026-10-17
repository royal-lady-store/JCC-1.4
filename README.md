# JCC — Jahir Clearance Certificate Portal

Official web portal and verification engine for **JCC (Jahir Clearance Certificate)**.  
- **Owner:** Mr. Jahir Narjinary  
- **Phone:** +91 7384512297  
- **Email:** jahirkumarnarjinary@gmail.com  
- **Designated Administrator:** jahirnarjinary04@gmail.com  
- **Office Address:** Alipurduar, Kumargram, West Bengal, 736203, India  

---

## 1. Statutory Notice & Disclaimer
JCC is an independent private application assistance and reference validation registry. It is **not** an official police department, government ministry, or statutory clearance authority. Any certificate issued through this portal is **not** an official Police Clearance Certificate (PCC) and must not be represented as such.

---

## 2. Why Live Shared Online Data Requires a Backend

A purely static website hosted on GitHub Pages runs exclusively within the local browser sandbox. **Browser-only mechanisms (such as localStorage) cannot synchronize data across separate devices.**

To allow an applicant to register and submit documents on a smartphone, and have those exact files and database records immediately appear on the administrator's dashboard on another computer:
1. **Live Database:** Hosted PostgreSQL via [Supabase](https://supabase.com) (free tier).
2. **Private File Storage:** Dedicated private storage buckets for applicant photographs, identity proofs, and payment screenshots.
3. **Row Level Security (RLS):** Server-side access rules guaranteeing that applicants can only access their own submissions, while authorized administrators can access all records.

---

## 3. Step-by-Step Backend Configuration Instructions

### Step 1: Create a Free Supabase Project
1. Visit [supabase.com](https://supabase.com) and create an account.
2. Click **New Project**, choose a database password, and create your project.
3. In the sidebar, navigate to **Project Settings** > **API**.
4. Copy your **Project URL** and the **`anon` `public` API Key**.
5. You can paste these directly into the setup card on the website or permanently place them in `app.js` under `JCC_CONFIG`.

### Step 2: Disable Email Confirmation for Instant Login
To enable instant registration without requiring email or OTP verification:
1. In your Supabase dashboard, go to **Authentication** > **Providers** > **Email**.
2. Toggle off **"Confirm email"** and click **Save**.

### Step 3: Run Database Schema Migrations
Open the **SQL Editor** in your Supabase dashboard and execute this complete script:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Status Domain Enum
CREATE TYPE application_status AS ENUM (
  'Draft',
  'Payment Pending',
  'Payment Verification Pending',
  'Pending for Approval',
  'Under Review',
  'Additional Information Required',
  'Approved',
  'Certificate Issued',
  'Rejected',
  'Expired'
);

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. System Global Settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  id INT PRIMARY KEY DEFAULT 1,
  upi_id TEXT NOT NULL DEFAULT '7384512297@upi',
  payee_name TEXT NOT NULL DEFAULT 'Mr. Jahir Narjinary',
  fee_inr NUMERIC NOT NULL DEFAULT 100.00,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_limit CHECK (id = 1)
);

INSERT INTO public.system_settings (id, upi_id, payee_name, fee_inr)
VALUES (1, '7384512297@upi', 'Mr. Jahir Narjinary', 100.00)
ON CONFLICT (id) DO NOTHING;

-- 4. Applications Table
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status application_status NOT NULL DEFAULT 'Draft',
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  dob DATE NOT NULL,
  nationality TEXT DEFAULT 'India',
  father_name TEXT NOT NULL,
  mother_name TEXT NOT NULL,
  spouse_name TEXT,
  aadhaar_number TEXT NOT NULL,
  passport_number TEXT,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  permanent_address TEXT NOT NULL,
  perm_city TEXT NOT NULL,
  perm_state TEXT NOT NULL,
  perm_pin TEXT NOT NULL,
  residence_duration TEXT NOT NULL,
  present_address TEXT,
  address_proof_type TEXT NOT NULL,
  photo_url TEXT,
  address_proof_url TEXT,
  supporting_doc_url TEXT,
  purpose TEXT NOT NULL,
  other_purpose TEXT,
  ref1_name TEXT NOT NULL,
  ref1_phone TEXT NOT NULL,
  ref1_address TEXT NOT NULL,
  ref2_name TEXT NOT NULL,
  ref2_phone TEXT NOT NULL,
  ref2_address TEXT NOT NULL,
  payment_utr TEXT,
  payment_screenshot_url TEXT,
  admin_notes TEXT,
  applicant_message TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Certificates Table
CREATE TABLE IF NOT EXISTS public.certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number TEXT UNIQUE NOT NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  applicant_name TEXT NOT NULL,
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Status Audit Log
CREATE TABLE IF NOT EXISTS public.status_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  changed_by UUID REFERENCES auth.users(id) NOT NULL,
  new_status application_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Contact Inquiries Table
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;