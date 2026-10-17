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

## 2. Live Supabase Backend Configuration

Your live Supabase project credentials are permanently embedded in `app.js`:
- **Project URL:** `https://qvpnmudxxwpochskjxkr.supabase.co`
- **Publishable Key:** `sb_publishable_i4LlGZGARNTYiPPZH77RSg_TqJp9tEG`

---

## 3. One-Time Setup on Supabase Dashboard

Naye Supabase project par saari functionality ko activate karne ke liye yeh step-by-step instructions poore karein:

### Step 1: Email Confirmation Off Karein (Instant Login ke liye)
1. Supabase Dashboard mein **Authentication** > **Providers** > **Email** par jayein.
2. **"Confirm email"** toggle ko **OFF** kar dein aur **Save** karein. Isse applicants bina email wait ke turant sign in kar sakenge.

### Step 2: Database Schema aur RLS Policies Run Karein
Supabase dashboard ke **SQL Editor** mein jakar **New query** par click karein aur neeche diya gaya complete SQL code run kar dein:

```sql
-- 1. UUID & Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Status Domain Enum
DO $$ BEGIN
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
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Profiles Table
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

-- 4. System Global Settings (UPI Details)
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

-- 5. Applications Table
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

-- 6. Certificates Table
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

-- 7. Status Audit Log
CREATE TABLE IF NOT EXISTS public.status_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  changed_by UUID REFERENCES auth.users(id) NOT NULL,
  new_status application_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Contact Inquiries Table
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- 10. Admin Check Helper Function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Security Policies
-- Profiles
DROP POLICY IF EXISTS "Users view own profile or admin views all" ON public.profiles;
CREATE POLICY "Users view own profile or admin views all"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- Settings
DROP POLICY IF EXISTS "Allow public read of system settings" ON public.system_settings;
CREATE POLICY "Allow public read of system settings"
ON public.system_settings FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Allow admin updates to settings" ON public.system_settings;
CREATE POLICY "Allow admin updates to settings"
ON public.system_settings FOR UPDATE
USING (public.is_admin());

-- Applications
DROP POLICY IF EXISTS "Applicants read own records, admins read all" ON public.applications;
CREATE POLICY "Applicants read own records, admins read all"
ON public.applications FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Applicants insert own records" ON public.applications;
CREATE POLICY "Applicants insert own records"
ON public.applications FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Applicants update own drafts, admins update all" ON public.applications;
CREATE POLICY "Applicants update own drafts, admins update all"
ON public.applications FOR UPDATE
USING (
  (auth.uid() = user_id AND status IN ('Draft', 'Payment Pending', 'Additional Information Required'))
  OR public.is_admin()
);

-- Certificates
DROP POLICY IF EXISTS "Applicants read own certificates, admins read all" ON public.certificates;
CREATE POLICY "Applicants read own certificates, admins read all"
ON public.certificates FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

-- Contact Messages
DROP POLICY IF EXISTS "Public insert contact messages" ON public.contact_messages;
CREATE POLICY "Public insert contact messages"
ON public.contact_messages FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read contact messages" ON public.contact_messages;
CREATE POLICY "Admins read contact messages"
ON public.contact_messages FOR SELECT
USING (public.is_admin());

-- 12. RPC Functions
-- A. Verify Certificate (Returns strictly non-sensitive attributes)
CREATE OR REPLACE FUNCTION public.verify_certificate(cert_no TEXT)
RETURNS JSON AS $$
DECLARE
  cert_rec RECORD;
BEGIN
  SELECT 
    c.certificate_number,
    c.applicant_name,
    c.issue_date,
    c.expiry_date,
    c.is_revoked,
    (CURRENT_DATE > c.expiry_date) AS is_expired
  INTO cert_rec
  FROM public.certificates c
  WHERE UPPER(c.certificate_number) = UPPER(TRIM(cert_no));

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN json_build_object(
    'found', true,
    'certificate_number', cert_rec.certificate_number,
    'applicant_name', cert_rec.applicant_name,
    'issue_date', cert_rec.issue_date,
    'expiry_date', cert_rec.expiry_date,
    'is_revoked', cert_rec.is_revoked,
    'is_expired', cert_rec.is_expired,
    'status', CASE 
      WHEN cert_rec.is_revoked THEN 'Revoked'
      WHEN cert_rec.is_expired THEN 'Expired'
      ELSE 'Valid & Active'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Issue Clearance Certificate (Admin Only with Payment Check)
CREATE OR REPLACE FUNCTION public.issue_clearance_certificate(app_id UUID)
RETURNS JSON AS $$
DECLARE
  v_app RECORD;
  v_cert_no TEXT;
  v_issue_date DATE := CURRENT_DATE;
  v_expiry_date DATE := CURRENT_DATE + INTERVAL '6 months';
  v_new_cert_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Caller lacks administrator role';
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = app_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Generate Non-sequential Serial Number: JCC-YYYY-[HEX]
  v_cert_no := 'JCC-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));

  INSERT INTO public.certificates (
    certificate_number,
    application_id,
    user_id,
    applicant_name,
    issue_date,
    expiry_date
  ) VALUES (
    v_cert_no,
    v_app.id,
    v_app.user_id,
    v_app.full_name,
    v_issue_date,
    v_expiry_date
  ) RETURNING id INTO v_new_cert_id;

  UPDATE public.applications
  SET status = 'Certificate Issued', updated_at = NOW()
  WHERE id = app_id;

  INSERT INTO public.status_audit_log (application_id, changed_by, new_status, note)
  VALUES (app_id, auth.uid(), 'Certificate Issued', 'Official clearance certificate issued.');

  RETURN json_build_object(
    'success', true,
    'certificate_number', v_cert_no,
    'certificate_id', v_new_cert_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Auto-Trigger for New User Profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, email, phone, is_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'user_id_alias', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Applicant'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Force Schema Cache Reload
NOTIFY pgrst, 'reload schema';