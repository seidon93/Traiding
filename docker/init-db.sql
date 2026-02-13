-- ============================================================
-- PostgreSQL Initialization Script
-- Creates schemas for the financial controlling data pipeline
-- ============================================================

-- Create the main database schemas
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS intermediate;
CREATE SCHEMA IF NOT EXISTS marts;

-- Create the Airflow database
CREATE DATABASE airflow;

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA raw TO financial_admin;
GRANT ALL PRIVILEGES ON SCHEMA staging TO financial_admin;
GRANT ALL PRIVILEGES ON SCHEMA intermediate TO financial_admin;
GRANT ALL PRIVILEGES ON SCHEMA marts TO financial_admin;

-- Set search path
ALTER DATABASE financial_controlling SET search_path TO public, raw, staging, intermediate, marts;
