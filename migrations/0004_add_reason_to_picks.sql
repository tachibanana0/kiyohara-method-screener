-- Migration: add reason column to picks
ALTER TABLE picks ADD COLUMN reason TEXT DEFAULT '';
