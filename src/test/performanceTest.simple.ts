/**
 * Simple Performance Testing - Data Generation Only
 *
 * This script generates test data and validates dataset structure.
 * For full performance testing (PDF generation, rendering), see performance.manual.md
 */

import { BestsellerList, BestsellerCategory, BestsellerBook } from '@/types/bestseller';

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
function generateTestBooks(count: number, categoryName: string): BestsellerBook[] {
  const books: BestsellerBook[] = [];
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
    } else if (random < 0.30) {
      wasDropped = true; // 15% dropped books
    } else {
      // 70% existing books with position changes
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
 * Validate dataset structure and statistics
 */
export function validateDataset(dataset: BestsellerList) {
  const totalBooks = dataset.categories.reduce((sum, cat) => sum + cat.books.length, 0);
  const newBooks = dataset.categories.flatMap(cat => cat.books).filter(b => b.isNew).length;
  const droppedBooks = dataset.categories.flatMap(cat => cat.books).filter(b => b.wasDropped).length;
  const booksWithISBN = dataset.categories.flatMap(cat => cat.books).filter(b => b.isbn).length;

  return {
    totalBooks,
    categories: dataset.categories.length,
    newBooks,
    droppedBooks,
    remainingBooks: totalBooks - newBooks - droppedBooks,
    booksWithISBN,
    percentNew: ((newBooks / totalBooks) * 100).toFixed(1),
    percentDropped: ((droppedBooks / totalBooks) * 100).toFixed(1),
  };
}

/**
 * Print dataset statistics
 */
export function printDatasetStats(stats: ReturnType<typeof validateDataset>) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 Large Dataset Generation - 100+ Books');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total Books:      ${stats.totalBooks}`);
  console.log(`Categories:       ${stats.categories}`);
  console.log(`Books per category: ~${Math.floor(stats.totalBooks / stats.categories)}`);
  console.log(`\nStatus Breakdown:`);
  console.log(`  New:            ${stats.newBooks} (${stats.percentNew}%)`);
  console.log(`  Dropped:        ${stats.droppedBooks} (${stats.percentDropped}%)`);
  console.log(`  Remaining:      ${stats.remainingBooks}`);
  console.log(`\nData Quality:`);
  console.log(`  Books with ISBN: ${stats.booksWithISBN}/${stats.totalBooks}`);

  console.log('\n✅ Dataset validation complete!');
  console.log('\n═══════════════════════════════════════════════════════\n');

  // Validation checks
  const checks = [
    { name: 'Has 100+ books', pass: stats.totalBooks >= 100 },
    { name: 'Has multiple categories', pass: stats.categories >= 2 },
    { name: 'All books have ISBNs', pass: stats.booksWithISBN === stats.totalBooks },
    { name: 'Realistic new book %', pass: parseFloat(stats.percentNew) > 5 && parseFloat(stats.percentNew) < 30 },
    { name: 'Realistic drop %', pass: parseFloat(stats.percentDropped) > 5 && parseFloat(stats.percentDropped) < 30 },
  ];

  console.log('Validation Checks:');
  checks.forEach(check => {
    console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
  });

  const allPassed = checks.every(c => c.pass);
  if (allPassed) {
    console.log('\n🎉 All validation checks passed!');
    console.log('\nNext steps:');
    console.log('1. Run `npm run dev` to start the application');
    console.log('2. Follow the manual testing guide in src/test/performance.manual.md');
    console.log('3. Test PDF generation, table rendering, and cache performance');
  } else {
    console.log('\n⚠️  Some validation checks failed - review dataset generation');
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  return allPassed;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dataset = generateLargeTestDataset(120);
  const stats = validateDataset(dataset);
  const passed = printDatasetStats(stats);

  process.exit(passed ? 0 : 1);
}
