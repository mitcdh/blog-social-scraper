const https = require('https');

try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv is not available. Continuing without loading environment variables from .env file.');
}

const USER_AGENT = 'blog-social-scraper/1.0 (+https://blog.mitcdh.au)';
const MAX_REDIRECTS = 5;

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

function getText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
        'User-Agent': USER_AGENT
      }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects while fetching ${url}`));
          return;
        }

        resolve(getText(new URL(response.headers.location, url).toString(), redirectCount + 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Letterboxd RSS returned HTTP ${response.statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let data = '';
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => resolve(data));
    });

    request.setTimeout(15000, () => request.destroy(new Error('Letterboxd RSS request timed out')));
    request.on('error', reject);
  });
}

async function getLetterboxdReviews(options = {}) {
  const username = options.username || process.env.LETTERBOXD_USERNAME;
  if (!username) {
    throw new Error('LETTERBOXD_USERNAME is required');
  }

  const feedUrl = options.feedUrl || `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
  const xml = options.xml || await getText(feedUrl);
  return parseFeed(xml);
}

module.exports = getLetterboxdReviews;
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
