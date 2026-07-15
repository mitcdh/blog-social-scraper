const fs = require('fs');
const https = require('https');

try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv is not available. Continuing without loading environment variables from .env file.');
}

const USER_AGENT = 'blog-social-scraper/1.0 (+https://blog.mitcdh.au)';
const MAX_REDIRECTS = 5;
const DEFAULT_ARCHIVE_CONCURRENCY = 4;

function decodeEntities(value = '') {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"'
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name.toLowerCase()] || entity);
}

function stripCdata(value = '') {
  return value.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1').trim();
}

function getTag(xml, tagName) {
  const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`, 'i'));
  return match ? decodeEntities(stripCdata(match[1]).trim()) : '';
}

function stripTags(value = '') {
  return decodeEntities(value.replace(/<[^>]*>/g, ''));
}

function htmlToMarkdown(html = '') {
  return decodeEntities(html)
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${stripTags(text).trim()}](${decodeEntities(href)})`)
    .replace(/<(strong|b)>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)>/gi, '*')
    .replace(/<\/(em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function retinaPosterUrl(url = '') {
  return decodeEntities(url).replace(
    /-0-\d+-0-\d+-(crop|fit)\.jpg/i,
    '-0-1200-0-1800-$1.jpg'
  );
}

function parseReviewItem(itemXml) {
  const id = getTag(itemXml, 'guid');
  if (!id.startsWith('letterboxd-review-')) {
    return null;
  }

  const descriptionHtml = stripCdata(getTag(itemXml, 'description'));
  const imageMatch = descriptionHtml.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  const reviewHtml = descriptionHtml.replace(/<p[^>]*>\s*<img\b[^>]*>\s*<\/p>/i, '');
  const review = htmlToMarkdown(reviewHtml);

  if (!review || !imageMatch) {
    return null;
  }

  return {
    id,
    title: getTag(itemXml, 'letterboxd:filmTitle'),
    year: getTag(itemXml, 'letterboxd:filmYear'),
    rating: getTag(itemXml, 'letterboxd:memberRating'),
    review,
    reviewDate: getTag(itemXml, 'pubDate'),
    watchedDate: getTag(itemXml, 'letterboxd:watchedDate'),
    link: getTag(itemXml, 'link'),
    coverImageUrl: retinaPosterUrl(imageMatch[1])
  };
}

function parseFeed(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.map(parseReviewItem).filter(Boolean);
}

function parseCsv(csv = '') {
  const input = String(csv).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      if (row.some(value => value !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new Error('Letterboxd archive contains an unterminated quoted field');
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(value => value !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function archiveId(link, title, reviewDate) {
  try {
    const identifier = new URL(link).pathname.split('/').filter(Boolean).pop();
    if (identifier) {
      return `letterboxd-archive-${identifier}`;
    }
  } catch (error) {
    // Fall back to a readable identity when an export contains an invalid URI.
  }

  const fallback = `${title}-${reviewDate}`
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `letterboxd-archive-${fallback}`;
}

function normalizeArchiveReview(value = '') {
  return value
    .replace(/\u200B/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseArchiveCsv(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) {
    return [];
  }

  const headers = rows.shift().map(header => header.trim());
  const requiredHeaders = ['Date', 'Name', 'Year', 'Letterboxd URI', 'Rating', 'Review', 'Watched Date'];
  const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(`Letterboxd archive is missing columns: ${missingHeaders.join(', ')}`);
  }

  const valueAt = (row, header) => row[headers.indexOf(header)] || '';

  return rows.map(row => {
    const title = valueAt(row, 'Name').trim();
    const reviewDate = valueAt(row, 'Date').trim();
    const link = valueAt(row, 'Letterboxd URI').trim();

    return {
      id: archiveId(link, title, reviewDate),
      title,
      year: valueAt(row, 'Year').trim(),
      rating: valueAt(row, 'Rating').trim(),
      review: normalizeArchiveReview(valueAt(row, 'Review')),
      reviewDate,
      watchedDate: valueAt(row, 'Watched Date').trim(),
      link,
      coverImageUrl: '',
      archive: true
    };
  }).filter(review => review.title && review.review && review.reviewDate && review.link);
}

function normalizedIdentityPart(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function reviewDateKey(value = '') {
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  }

  const monthNumbers = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };
  const rfcDate = String(value).match(/^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (rfcDate && monthNumbers[rfcDate[2]]) {
    return `${rfcDate[3]}-${monthNumbers[rfcDate[2]]}-${rfcDate[1].padStart(2, '0')}`;
  }

  return normalizedIdentityPart(value);
}

function reviewIdentity(review) {
  return [
    normalizedIdentityPart(review.title),
    normalizedIdentityPart(review.year),
    reviewDateKey(review.reviewDate)
  ].join('|');
}

function reviewContentIdentity(review) {
  return [
    normalizedIdentityPart(review.title),
    normalizedIdentityPart(review.year),
    normalizedIdentityPart(review.review)
  ].join('|');
}

function watchedIdentity(review) {
  if (!review.watchedDate) {
    return '';
  }

  return [
    normalizedIdentityPart(review.title),
    normalizedIdentityPart(review.year),
    reviewDateKey(review.watchedDate)
  ].join('|');
}

function mergeReviews(archiveReviews = [], feedReviews = []) {
  const merged = [...archiveReviews];

  for (const feedReview of feedReviews) {
    const identity = reviewIdentity(feedReview);
    const contentIdentity = reviewContentIdentity(feedReview);
    const watched = watchedIdentity(feedReview);
    const existingIndex = merged.findIndex(review => (
      reviewIdentity(review) === identity ||
      reviewContentIdentity(review) === contentIdentity ||
      (watched && watchedIdentity(review) === watched)
    ));

    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...feedReview, archive: true };
    } else {
      merged.push(feedReview);
    }
  }

  return merged;
}

function getText(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: options.accept || 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        'User-Agent': USER_AGENT
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }

        resolve(getText(new URL(response.headers.location, url).toString(), options, redirectCount + 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`${options.label || 'Letterboxd request'} returned HTTP ${response.statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let data = '';
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => resolve(data));
    });

    request.setTimeout(15000, () => request.destroy(new Error(`${options.label || 'Letterboxd request'} timed out`)));
    request.on('error', reject);
  });
}

function metaContent(html, property) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const target = property.toLowerCase();

  for (const tag of tags) {
    const propertyMatch = tag.match(/(?:property|name)=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (propertyMatch?.[1].toLowerCase() === target && contentMatch) {
      return decodeEntities(contentMatch[1]);
    }
  }

  return '';
}

function extractPosterUrl(html = '') {
  const decodedHtml = decodeEntities(html);
  const candidates = decodedHtml.match(/https:\/\/a\.ltrbxd\.com\/resized\/(?:sm\/upload|film-poster)\/[^"'\s<>]+?\.jpg(?:\?[^"'\s<>]+)?/gi) || [];
  const portrait = candidates.find(url => {
    const dimensions = url.match(/-0-(\d+)-0-(\d+)-(?:crop|fit)\.jpg/i);
    return dimensions && Number(dimensions[2]) / Number(dimensions[1]) >= 1.3;
  });

  return retinaPosterUrl(portrait || metaContent(html, 'og:image'));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function addArchiveCovers(reviews, options = {}) {
  const concurrency = Math.max(1, Number(options.archiveConcurrency || process.env.LETTERBOXD_ARCHIVE_CONCURRENCY || DEFAULT_ARCHIVE_CONCURRENCY));
  const resolveCover = options.resolveCover || (async review => {
    const html = await getText(review.link, {
      accept: 'text/html,application/xhtml+xml;q=0.9',
      label: `Letterboxd archive poster lookup for ${review.title}`
    });
    return extractPosterUrl(html);
  });

  return mapWithConcurrency(reviews, concurrency, async review => {
    if (review.coverImageUrl || !review.archive) {
      return review;
    }

    try {
      return { ...review, coverImageUrl: retinaPosterUrl(await resolveCover(review)) };
    } catch (error) {
      console.warn(`Unable to resolve Letterboxd archive poster for '${review.title}': ${error.message}`);
      return review;
    }
  });
}

async function getLetterboxdReviews(options = {}) {
  const username = options.username || process.env.LETTERBOXD_USERNAME;
  const archivePath = options.archivePath || process.env.LETTERBOXD_ARCHIVE_PATH;
  let archiveReviews = [];
  let feedReviews = [];

  if (typeof options.csv === 'string') {
    archiveReviews = parseArchiveCsv(options.csv);
  } else if (archivePath && fs.existsSync(archivePath)) {
    archiveReviews = parseArchiveCsv(fs.readFileSync(archivePath, 'utf8'));
  }

  if (typeof options.xml === 'string') {
    feedReviews = parseFeed(options.xml);
  } else if (username) {
    const feedUrl = options.feedUrl || `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
    feedReviews = parseFeed(await getText(feedUrl, { label: 'Letterboxd RSS' }));
  }

  if (!archiveReviews.length && !feedReviews.length && !username) {
    throw new Error('LETTERBOXD_USERNAME or a Letterboxd archive CSV is required');
  }

  const reviews = mergeReviews(archiveReviews, feedReviews);
  return options.resolveArchiveCovers === false ? reviews : addArchiveCovers(reviews, options);
}

module.exports = getLetterboxdReviews;
module.exports.addArchiveCovers = addArchiveCovers;
module.exports.extractPosterUrl = extractPosterUrl;
module.exports.mergeReviews = mergeReviews;
module.exports.parseArchiveCsv = parseArchiveCsv;
module.exports.parseCsv = parseCsv;
module.exports.parseFeed = parseFeed;
module.exports.parseReviewItem = parseReviewItem;
module.exports.retinaPosterUrl = retinaPosterUrl;

if (require.main === module) {
  getLetterboxdReviews()
    .then(reviews => console.log(JSON.stringify(reviews, null, 2)))
    .catch(error => {
      console.error('Error fetching Letterboxd reviews:', error.message);
      process.exitCode = 1;
    });
}
