-- Safely create tables and policies for locations (Drops existing policies first)

-- 1. Countries
CREATE TABLE IF NOT EXISTS public.countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Counties
CREATE TABLE IF NOT EXISTS public.counties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country_id UUID REFERENCES public.countries(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, country_id)
);

-- 3. Sub-Counties
CREATE TABLE IF NOT EXISTS public.sub_counties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    county_id UUID REFERENCES public.counties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, county_id)
);

-- 4. Wards
CREATE TABLE IF NOT EXISTS public.wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sub_county_id UUID REFERENCES public.sub_counties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, sub_county_id)
);

-- Enable RLS
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;

-- DROP POLICIES IF THEY EXIST (Fixes ERROR: 42710)
DROP POLICY IF EXISTS "Public read access" ON public.countries;
DROP POLICY IF EXISTS "Admin insert" ON public.countries;
DROP POLICY IF EXISTS "Admin delete" ON public.countries;

DROP POLICY IF EXISTS "Public read access" ON public.counties;
DROP POLICY IF EXISTS "Admin write" ON public.counties;

DROP POLICY IF EXISTS "Public read access" ON public.sub_counties;
DROP POLICY IF EXISTS "Admin write" ON public.sub_counties;

DROP POLICY IF EXISTS "Public read access" ON public.wards;
DROP POLICY IF EXISTS "Admin write" ON public.wards;

-- RE-CREATE POLICIES
CREATE POLICY "Public read access" ON public.countries FOR SELECT USING (true);
CREATE POLICY "Admin insert" ON public.countries FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin delete" ON public.countries FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Public read access" ON public.counties FOR SELECT USING (true);
CREATE POLICY "Admin write" ON public.counties FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Public read access" ON public.sub_counties FOR SELECT USING (true);
CREATE POLICY "Admin write" ON public.sub_counties FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Public read access" ON public.wards FOR SELECT USING (true);
CREATE POLICY "Admin write" ON public.wards FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));