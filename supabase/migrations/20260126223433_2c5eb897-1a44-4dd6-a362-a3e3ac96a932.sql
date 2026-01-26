-- Allow partners and baristas to upload to shop-logos bucket
CREATE POLICY "Partners can upload shop logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shop-logos' 
  AND (storage.foldername(name))[1] = 'logos'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'partner') 
    OR has_role(auth.uid(), 'barista')
  )
);

-- Allow partners and admins to update their shop logos
CREATE POLICY "Partners can update shop logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'partner') 
    OR has_role(auth.uid(), 'barista')
  )
)
WITH CHECK (
  bucket_id = 'shop-logos'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'partner') 
    OR has_role(auth.uid(), 'barista')
  )
);

-- Allow partners to delete shop logos
CREATE POLICY "Partners can delete shop logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'shop-logos'
  AND (
    has_role(auth.uid(), 'admin') 
    OR has_role(auth.uid(), 'partner') 
    OR has_role(auth.uid(), 'barista')
  )
);