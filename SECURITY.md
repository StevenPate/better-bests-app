# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Better Bestsellers App seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **DO NOT** open a public issue
2. Email the details to the maintainer through GitHub
3. Include the following information:
   - Type of vulnerability
   - Full paths of source file(s) related to the vulnerability
   - Location of the affected source code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact of the issue

### What to Expect

- Acknowledgment of your report within 48 hours
- Regular updates on the progress
- Credit for responsible disclosure (if desired)

### Security Best Practices for Users

1. **Environment Variables**
   - Never commit `.env` files with real credentials
   - Use `.env.example` as a template
   - Keep production credentials secure

2. **API Keys**
   - Rotate Supabase keys regularly
   - Use Row Level Security (RLS) in Supabase
   - Never expose service role keys in client code

3. **Dependencies**
   - Keep dependencies up to date
   - Run `npm audit` regularly
   - Review and fix vulnerabilities

## Scope

The following are within scope for security reports:
- Authentication/authorization issues
- Data exposure or leakage
- SQL injection vulnerabilities
- Cross-site scripting (XSS)
- Dependency vulnerabilities

## Thank You

We appreciate your efforts to responsibly disclose your findings and will make every effort to acknowledge your contributions.