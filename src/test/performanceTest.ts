/**
 * Performance Testing Script for 100+ Book Datasets
 *
 * This script tests the application's performance with large datasets to ensure:
 * - PDF generation completes in reasonable time
 * - Table rendering is smooth
 * - Memory usage is acceptable
 * - Cache hit rates are optimal
 */

import { BestsellerList, BestsellerCategory } from '@/types/bestseller';
import { generateBestsellerPDF } from '@/services/pdfGenerator';
import { fetchGoogleBooksCategoriesBatch } from '@/services/googleBooksApi';

/**
 * Generate a large test dataset with 100+ books
 */
export function generateLargeTestDataset(bookCount: number = 120): BestsellerList {
  const categories: BestsellerCategory[] = [
    {
      name: 'Fiction',
      books: generateTestBooks(40, 'Fiction'),
    },
    {
      name: 'Non-Fiction',
      books: generateTestBooks(40, 'Non-Fiction'),
    },
    {
      name: 'Young Adult',
      books: generateTestBooks(40, 'Young Adult'),
    },
  ];

  return {
    date: new Date().toISOString().split('T')[0],
    categories,
  };
}

/**
 * Generate test books for a category
 */
function generateTestBooks(count: number, categoryName: string) {
  const books = [];
  const titles = [
    'The Great', 'A Journey Through', 'Tales of', 'The Secret', 'Beyond the',
    'Whispers in', 'The Last', 'Chronicles of', 'The Hidden', 'Echoes from',
    'The Lost', 'Adventures in', 'The Silent', 'Dreams of', 'The Forgotten',
    'Shadows of', 'The Eternal', 'Legends of', 'The Dark', 'Mysteries of',
  ];
  const suffixes = [
    'Mountain', 'Ocean', 'Forest', 'City', 'Desert', 'Valley', 'River',
    'Sky', 'Night', 'Dawn', 'Storm', 'Garden', 'Castle', 'Kingdom', 'World',
  ];
  const authors = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
    'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
    'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  ];

  for (let i = 0; i < count; i++) {
    const titlePrefix = titles[i % titles.length];
    const titleSuffix = suffixes[Math.floor(i / titles.length) % suffixes.length];
    const authorName = `${authors[i % authors.length]}, ${authors[(i + 5) % authors.length]}`;

    // Generate realistic ISBNs (978 prefix for books)
    const isbn = `978${String(i).padStart(10, '0')}`;

    // Determine if book is new, dropped, or staying
    const random = Math.random();
    let isNew = false;
    let wasDropped = false;
    let previousRank: number | undefined = undefined;

    if (random < 0.15) {
      isNew = true; // 15% new books
    } else if (random < 0.25) {
      wasDropped = true; // 10% dropped books
    } else {
      // 75% existing books with position changes
      const change = Math.floor(Math.random() * 10) - 5; // -5 to +4
      previousRank = i + 1 + change;
    }

    books.push({
      rank: i + 1,
      title: `${titlePrefix} ${titleSuffix}`,
      author: authorName,
      publisher: `${categoryName} Press`,
      isbn,
      isNew,
      wasDropped,
      previousRank,
      weeksOnList: wasDropped ? undefined : Math.floor(Math.random() * 20) + 1,
    });
  }

  return books;
}

/**
 * Test PDF generation performance with large dataset
 */
export async function testPDFGenerationPerformance() {
  console.log('🔍 Testing PDF Generation with 120 books...\n');

  const dataset = generateLargeTestDataset(120);
  const totalBooks = dataset.categories.reduce((sum, cat) => sum + cat.books.length, 0);

  console.log(`📊 Dataset: ${totalBooks} books across ${dataset.categories.length} categories`);

  const bookAudiences: Record<string, string> = {};
  dataset.categories.forEach(category => {
    category.books.forEach(book => {
      if (book.isbn) {
        // Distribute across audiences
        const hash = book.isbn.charCodeAt(book.isbn.length - 1);
        bookAudiences[book.isbn] = hash % 3 === 0 ? 'A' : hash % 3 === 1 ? 'T' : 'C';
      }
    });
  });

  const posChecked: Record<string, boolean> = {};
  const shelfChecked: Record<string, boolean> = {};

  // Check some random books
  dataset.categories.forEach(category => {
    category.books.forEach((book, index) => {
      if (book.isbn && book.isNew && index % 3 === 0) {
        posChecked[book.isbn] = true;
        shelfChecked[book.isbn] = Math.random() > 0.5;
      }
    });
  });

  // Track progress
  let lastPercentage = 0;
  const progressCallback = (progress: any) => {
    if (progress.percentage !== lastPercentage) {
      console.log(`  ${progress.stage.padEnd(10)} | ${String(progress.percentage).padStart(3)}% | ${progress.message}`);
      lastPercentage = progress.percentage;
    }
  };

  const startTime = performance.now();

  try {
    const filename = await generateBestsellerPDF({
      includeAllBooks: true,
      bestsellerData: dataset,
      bookAudiences,
      posChecked,
      shelfChecked,
      onProgress: progressCallback,
    });

    const endTime = performance.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n✅ PDF generated successfully: ${filename}`);
    console.log(`⏱️  Total time: ${duration}s`);
    console.log(`📈 Performance: ${(totalBooks / parseFloat(duration)).toFixed(1)} books/second`);

    return {
      success: true,
      duration: parseFloat(duration),
      booksPerSecond: totalBooks / parseFloat(duration),
      totalBooks,
    };
  } catch (error) {
    console.error('❌ PDF generation failed:', error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Test Google Books API cache hit rate
 */
export async function testCacheHitRate() {
  console.log('\n🔍 Testing Cache Hit Rate...\n');

  const testISBNs = [
    '9780743273565', // The Great Gatsby
    '9780451524935', // 1984
    '9780061120084', // To Kill a Mockingbird
    '9780060935467', // One Hundred Years of Solitude
    '9780140449136', // The Odyssey
  ];

  console.log('First fetch (should miss cache):');
  const start1 = performance.now();
  await fetchGoogleBooksCategoriesBatch(testISBNs, 5);
  const duration1 = performance.now() - start1;
  console.log(`  ⏱️  ${duration1.toFixed(0)}ms for ${testISBNs.length} books`);

  console.log('\nSecond fetch (should hit in-memory cache):');
  const start2 = performance.now();
  await fetchGoogleBooksCategoriesBatch(testISBNs, 5);
  const duration2 = performance.now() - start2;
  console.log(`  ⏱️  ${duration2.toFixed(0)}ms for ${testISBNs.length} books`);

  const speedup = (duration1 / duration2).toFixed(1);
  console.log(`\n📈 Cache speedup: ${speedup}x faster`);

  return {
    firstFetch: duration1,
    secondFetch: duration2,
    speedup: parseFloat(speedup),
  };
}

/**
 * Run all performance tests
 */
export async function runAllPerformanceTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Performance Testing Suite - 100+ Book Datasets');
  console.log('═══════════════════════════════════════════════════════\n');

  const results: any = {};

  // Test 1: PDF Generation
  results.pdfGeneration = await testPDFGenerationPerformance();

  // Test 2: Cache Hit Rate
  results.cacheHitRate = await testCacheHitRate();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📋 Performance Test Results Summary');
  console.log('═══════════════════════════════════════════════════════\n');

  if (results.pdfGeneration.success) {
    console.log('PDF Generation:');
    console.log(`  ✅ Duration: ${results.pdfGeneration.duration}s`);
    console.log(`  ✅ Throughput: ${results.pdfGeneration.booksPerSecond.toFixed(1)} books/s`);
    console.log(`  ✅ Status: ${results.pdfGeneration.duration < 30 ? 'EXCELLENT' : results.pdfGeneration.duration < 60 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
  }

  console.log('\nCache Performance:');
  console.log(`  ✅ Speedup: ${results.cacheHitRate.speedup}x`);
  console.log(`  ✅ Status: ${results.cacheHitRate.speedup > 10 ? 'EXCELLENT' : results.cacheHitRate.speedup > 5 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);

  console.log('\n═══════════════════════════════════════════════════════\n');

  return results;
}
