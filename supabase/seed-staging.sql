-- supabase/seed-staging.sql
-- Synthetic test data for staging environment
-- DO NOT run against production
--
-- MAINTENANCE SCHEDULE:
-- - Refresh monthly (1st of month) or after schema changes
-- - Ensure multi-region parity (all 8 regions represented)
-- - Update to reflect latest production data patterns
-- - Test edge cases (empty categories, long titles, special chars)
--
-- Last updated: 2025-11-03
-- Updated by: Better-bests-app

-- Clear existing data (staging only!)
TRUNCATE TABLE bestseller_switches, book_audiences, book_positions, bestseller_list_metadata, fetch_cache CASCADE;

-- Insert synthetic bestseller metadata for PNBA
INSERT INTO bestseller_list_metadata (list_date, region, checksum, raw_text_url) VALUES
('2024-11-06', 'PNBA', 'test-checksum-pnba-1', 'https://example.com/pnba-20241106.txt'),
('2024-10-30', 'PNBA', 'test-checksum-pnba-2', 'https://example.com/pnba-20241030.txt'),
('2024-10-23', 'PNBA', 'test-checksum-pnba-3', 'https://example.com/pnba-20241023.txt');

-- Insert synthetic bestseller metadata for multi-region testing (future-ready)
INSERT INTO bestseller_list_metadata (list_date, region, checksum, raw_text_url) VALUES
('2024-11-06', 'SIBA', 'test-checksum-siba-1', 'https://example.com/siba-20241106.txt'),
('2024-11-06', 'CALIBAN', 'test-checksum-caliban-1', 'https://example.com/caliban-20241106.txt'),
('2024-11-06', 'GLIBA', 'test-checksum-gliba-1', 'https://example.com/gliba-20241106.txt');

-- Insert synthetic book positions (PNBA)
-- Book 1: Present in both weeks (rank change)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9780143127550', 'The Great Novel', 'Jane Author', 'Hardcover Fiction', 1, '2024-11-06', 'PNBA Bestsellers', 'Test Publisher', false, false),
('9780143127550', 'The Great Novel', 'Jane Author', 'Hardcover Fiction', 3, '2024-10-30', 'PNBA Bestsellers', 'Test Publisher', false, false),
('9780143127550', 'The Great Novel', 'Jane Author', 'Hardcover Fiction', 5, '2024-10-23', 'PNBA Bestsellers', 'Test Publisher', true, false);

-- Book 2: New this week (is_new = true)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9780735219090', 'Learning TypeScript', 'Tech Writer', 'Hardcover Nonfiction', 1, '2024-11-06', 'PNBA Bestsellers', 'Code Press', true, false);

-- Book 3: Dropped off list (was_dropped = true)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9781250178626', 'Mystery at Midnight', 'Detective Author', 'Paperback Fiction', 8, '2024-10-30', 'PNBA Bestsellers', 'Mystery House', false, true);

-- Book 4: Teen audience
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9780062315007', 'Young Heroes Rise', 'YA Author', 'Young Adult Hardcover', 1, '2024-11-06', 'PNBA Bestsellers', 'Teen Reads', true, false);

-- Book 5: Children audience
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9780545010221', 'Adventures in Magic School', 'Kids Author', 'Children''s Middle Grade', 1, '2024-11-06', 'PNBA Bestsellers', 'Young Readers', false, false);

-- Book 6: Edge case - very long title
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9781234567890', 'This Is A Very Long Title That Tests The System''s Ability To Handle Titles That Exceed Normal Length Expectations And May Cause Display Issues', 'Long Name Author', 'Hardcover Fiction', 10, '2024-11-06', 'PNBA Bestsellers', 'Verbose Publishing', false, false);

-- Book 7: Edge case - author with special characters
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9789876543210', 'Café Stories', 'François Müller-O''Brien', 'Hardcover Fiction', 11, '2024-11-06', 'PNBA Bestsellers', 'International Press', true, false);

-- Multi-region books (same book on different regional lists)
-- Book 8: On both PNBA and SIBA lists
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9780062073488', 'National Bestseller', 'Popular Author', 'Hardcover Fiction', 2, '2024-11-06', 'PNBA Bestsellers', 'Major Publisher', false, false),
('9780062073488', 'National Bestseller', 'Popular Author', 'Hardcover Fiction', 1, '2024-11-06', 'SIBA Bestsellers', 'Major Publisher', true, false);

-- Book 9: Only on SIBA (for "Elsewhere" feature testing)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9781111111111', 'Southern Stories', 'Southern Author', 'Hardcover Fiction', 3, '2024-11-06', 'SIBA Bestsellers', 'Southern Press', false, false);

-- Book 10: Only on CALIBAN (for "Elsewhere" feature testing)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9782222222222', 'California Dreams', 'West Coast Author', 'Hardcover Nonfiction', 1, '2024-11-06', 'CALIBAN Bestsellers', 'Pacific Press', true, false);

-- Book 11: Only on GLIBA (for "Elsewhere" feature testing)
INSERT INTO book_positions (isbn, title, author, category, rank, week_date, list_title, publisher, is_new, was_dropped) VALUES
('9783333333333', 'Great Lakes Tales', 'Midwest Author', 'Hardcover Fiction', 2, '2024-11-06', 'GLIBA Bestsellers', 'Lakes Publishing', false, false);

-- Insert synthetic book audiences
INSERT INTO book_audiences (isbn, audience) VALUES
('9780143127550', 'A'),  -- Adult
('9780735219090', 'A'),  -- Adult
('9781250178626', 'A'),  -- Adult
('9780062315007', 'T'),  -- Teen
('9780545010221', 'C'),  -- Children
('9781234567890', 'A'),  -- Adult
('9789876543210', 'A'),  -- Adult
('9780062073488', 'A'),  -- Adult
('9781111111111', 'A'),  -- Adult
('9782222222222', 'A'),  -- Adult
('9783333333333', 'A');  -- Adult

-- Insert test switches data (PNBA only - switches are region-specific)
INSERT INTO bestseller_switches (isbn, list_date, pos_value, shelf_value, user_id, book_isbn, switch_type) VALUES
('9780143127550', '2024-11-06', true, false, '00000000-0000-0000-0000-000000000000', '9780143127550', 'pos'),
('9780735219090', '2024-11-06', false, true, '00000000-0000-0000-0000-000000000000', '9780735219090', 'shelf'),
('9780062315007', '2024-11-06', true, true, '00000000-0000-0000-0000-000000000000', '9780062315007', 'pos');

-- Insert sample fetch_cache entries (for testing caching behavior)
INSERT INTO fetch_cache (url, response_data, expires_at) VALUES
('https://www.googleapis.com/books/v1/volumes?q=isbn:9780143127550',
 '{"items": [{"volumeInfo": {"title": "The Great Novel", "authors": ["Jane Author"]}}]}',
 NOW() + INTERVAL '30 days'),
('https://www.googleapis.com/books/v1/volumes?q=isbn:9780735219090',
 '{"items": [{"volumeInfo": {"title": "Learning TypeScript", "authors": ["Tech Writer"]}}]}',
 NOW() + INTERVAL '30 days');

-- Verify seeded data
SELECT 'Metadata rows:' as check, COUNT(*) as count FROM bestseller_list_metadata
UNION ALL
SELECT 'Position rows:', COUNT(*) FROM book_positions
UNION ALL
SELECT 'Audience rows:', COUNT(*) FROM book_audiences
UNION ALL
SELECT 'Switches rows:', COUNT(*) FROM bestseller_switches
UNION ALL
SELECT 'Cache rows:', COUNT(*) FROM fetch_cache;

-- Multi-region coverage summary
SELECT region, COUNT(*) as book_count
FROM book_positions
WHERE week_date = '2024-11-06'
GROUP BY region
ORDER BY region;

-- Audience distribution
SELECT audience, COUNT(*) as count
FROM book_audiences
GROUP BY audience
ORDER BY audience;

-- Adds/Drops summary
SELECT
  SUM(CASE WHEN is_new = true THEN 1 ELSE 0 END) as new_books,
  SUM(CASE WHEN was_dropped = true THEN 1 ELSE 0 END) as dropped_books
FROM book_positions
WHERE week_date = '2024-11-06';
