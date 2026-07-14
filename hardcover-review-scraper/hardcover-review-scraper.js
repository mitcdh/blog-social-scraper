const https = require('https');

try {
  require('dotenv').config();
} catch (error) {
  console.warn('dotenv is not available. Continuing without loading environment variables from .env file.');
}

const API_URL = 'https://api.hardcover.app/v1/graphql';
const USER_AGENT = 'blog-social-scraper/1.0 (+https://blog.mitcdh.au)';
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 100;

const CURRENT_USER_QUERY = `
  query CurrentUser {
    me {
      id
      username
    }
  }
`;

const REVIEWS_QUERY = `
  query Reviews($userId: Int!, $limit: Int!, $offset: Int!) {
    user_books(
      where: {
        user_id: { _eq: $userId }
        has_review: { _eq: true }
      }
      order_by: [
        { reviewed_at: desc }
        { date_added: desc }
      ]
      limit: $limit
      offset: $offset
    ) {
      id
      reviewed_at
      date_added
      review_raw
      rating
      book {
        id
        title
        slug
        image {
          url
          width
          height
        }
      }
    }
  }
`;

function authorizationHeader(token) {
  return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

function graphQLRequest(query, variables, token) {
  const body = JSON.stringify({ query, variables });
  const endpoint = new URL(API_URL);

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: endpoint.pathname,
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authorizationHeader(token),
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      }
    }, response => {
      response.setEncoding('utf8');
      let data = '';

      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(data);
        } catch (error) {
          reject(new Error(`Hardcover returned invalid JSON (HTTP ${response.statusCode})`));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Hardcover API returned HTTP ${response.statusCode}: ${payload.error || 'request failed'}`));
          return;
        }

        if (payload.errors && payload.errors.length) {
          reject(new Error(`Hardcover GraphQL error: ${payload.errors.map(item => item.message).join('; ')}`));
          return;
        }

        resolve(payload.data || {});
      });
    });

    request.setTimeout(30000, () => request.destroy(new Error('Hardcover API request timed out')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function firstRecord(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeReview(userBook, username) {
  const book = userBook.book || {};
  const image = firstRecord(book.image) || {};
  const review = String(userBook.review_raw || '').trim();
  const reviewDate = userBook.reviewed_at || userBook.date_added;

  if (!book.title || !book.slug || !review || !reviewDate || !image.url) {
    return null;
  }

  return {
    id: String(userBook.id),
    title: book.title,
    rating: userBook.rating == null ? '' : String(userBook.rating),
    review,
    reviewDate,
    link: `https://hardcover.app/books/${book.slug}`,
    profileLink: username ? `https://hardcover.app/@${username}` : '',
    coverImageUrl: image.url,
    coverWidth: image.width || null,
    coverHeight: image.height || null
  };
}

async function getHardcoverReviews(options = {}) {
  const token = options.token || process.env.HARDCOVER_API_TOKEN;
  if (!token) {
    throw new Error('HARDCOVER_API_TOKEN is required');
  }

  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || process.env.HARDCOVER_PAGE_SIZE || DEFAULT_PAGE_SIZE)));
  const maxPages = Math.max(1, Number(options.maxPages || process.env.HARDCOVER_MAX_PAGES || DEFAULT_MAX_PAGES));
  const request = options.request || ((query, variables) => graphQLRequest(query, variables, token));

  const currentUserData = await request(CURRENT_USER_QUERY, {});
  const currentUser = firstRecord(currentUserData.me);
  if (!currentUser || !currentUser.id) {
    throw new Error('Hardcover did not return the authenticated user');
  }

  const reviews = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const data = await request(REVIEWS_QUERY, {
      userId: currentUser.id,
      limit: pageSize,
      offset
    });
    const userBooks = data.user_books || [];

    reviews.push(...userBooks
      .map(userBook => normalizeReview(userBook, currentUser.username))
      .filter(Boolean));

    if (userBooks.length < pageSize) {
      return reviews;
    }
  }

  throw new Error(`Hardcover review pagination exceeded ${maxPages} pages; increase HARDCOVER_MAX_PAGES`);
}

module.exports = getHardcoverReviews;
module.exports.CURRENT_USER_QUERY = CURRENT_USER_QUERY;
module.exports.REVIEWS_QUERY = REVIEWS_QUERY;
module.exports.authorizationHeader = authorizationHeader;
module.exports.normalizeReview = normalizeReview;

if (require.main === module) {
  getHardcoverReviews()
    .then(reviews => console.log(JSON.stringify(reviews, null, 2)))
    .catch(error => {
      console.error('Error fetching Hardcover reviews:', error.message);
      process.exitCode = 1;
    });
}
