-- Add rejection reason and email fields to applications table
ALTER TABLE applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE applications ADD COLUMN rejection_email TEXT;
