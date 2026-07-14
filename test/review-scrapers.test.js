const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const getLetterboxdReviews = require('../letterboxd-review-scraper/letterboxd-review-scraper');
const getHardcoverReviews = require('../hardcover-review-scraper/hardcover-review-scraper');
const socialScraper = require('../blog-social-scraper');

test('Letterboxd parser returns written reviews and ignores watch-only entries', () => {
  const xml = `
    <rss xmlns:letterboxd="https://letterboxd.com">
      <channel>
        <item>
          <link>https://letterboxd.com/example/film/howls-moving-castle/</link>
          <guid isPermaLink="false">letterboxd-review-123</guid>
          <pubDate>Sun, 1 Feb 2026 00:53:47 +1300</pubDate>
          <letterboxd:watchedDate>2026-01-10</letterboxd:watchedDate>
          <letterboxd:filmTitle>Howl&#039;s Moving Castle</letterboxd:filmTitle>
          <letterboxd:filmYear>2004</letterboxd:filmYear>
          <letterboxd:memberRating>4.5</letterboxd:memberRating>
          <description><![CDATA[
            <p><img src="https://a.ltrbxd.com/resized/film-poster/4/9/0/6/2/49062-howl-s-moving-castle-0-600-0-900-crop.jpg?v=test"/></p>
            <p>A <strong>beautiful</strong> film &amp; a thoughtful review.</p>
          ]]></description>
        </item>
        <item>
          <guid isPermaLink="false">letterboxd-watch-456</guid>
          <letterboxd:filmTitle>Watch only</letterboxd:filmTitle>
          <description><![CDATA[<p>Watched on Sunday.</p>]]></description>
        </item>
      </channel>
    </rss>`;

  const reviews = getLetterboxdReviews.parseFeed(xml);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].title, "Howl's Moving Castle");
  assert.equal(reviews[0].rating, '4.5');
  assert.equal(reviews[0].review, 'A **beautiful** film & a thoughtful review.');
  assert.match(reviews[0].coverImageUrl, /-0-1200-0-1800-crop\.jpg\?v=test$/);
});

test('Hardcover scraper identifies the current user and paginates written reviews', async () => {
  const calls = [];
  const request = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('CurrentUser')) {
      return { me: [{ id: 42, username: 'reader' }] };
    }
    if (variables.offset === 0) {
      return {
        user_books: [{
          id: 99,
          reviewed_at: '2026-06-02T12:30:00+00:00',
          date_added: '2026-06-01',
          review_raw: 'A precise and useful review.',
          rating: 4.5,
          book: {
            id: 12,
            title: 'A Great Book',
            slug: 'a-great-book',
            image: { url: 'https://assets.hardcover.app/cover.jpeg', width: 1200, height: 1800 }
          }
        }]
      };
    }
    return { user_books: [] };
  };

  const reviews = await getHardcoverReviews({ token: 'secret', pageSize: 1, request });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].reviewDate, '2026-06-02T12:30:00+00:00');
  assert.equal(reviews[0].link, 'https://hardcover.app/books/a-great-book');
  assert.equal(reviews[0].profileLink, 'https://hardcover.app/@reader');
  assert.deepEqual(calls.slice(1).map(call => call.variables.offset), [0, 1]);
  assert.match(calls[1].query, /has_review:\s*\{ _eq: true \}/);
});

test('review posts use the review timestamp, cover, shared Review tag, and source link', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-review-post-'));
  const contentDir = path.join(temporaryRoot, 'content', 'posts');
  fs.mkdirSync(contentDir, { recursive: true });

  try {
    const result = socialScraper.createReviewPost({
      id: 'letterboxd-review-123',
      title: 'Example Film',
      year: '2026',
      rating: '4.5',
      review: 'A detailed review with enough text to use as its description.',
      reviewDate: 'Sun, 1 Feb 2026 00:53:47 +1300',
      link: 'https://letterboxd.com/example/film/example-film/'
    }, 'letterboxd', 'Letterboxd', { contentDir });

    const post = fs.readFileSync(result.filePath, 'utf8');
    assert.equal(path.basename(result.filePath), 'example-film-2026-02-01-film-review.md');
    assert.match(post, /title: "Example Film \(2026\)"/);
    assert.match(post, /date: 2026-02-01 00:53:47 \+1300/);
    assert.match(post, /image: "\/images\/example-film-2026-02-01-film-review\.jpg"/);
    assert.match(post, /tags: \["Review","Film"\]/);
    assert.match(post, /review_source: "letterboxd"/);
    assert.match(post, /\[View this review on Letterboxd\]\(https:\/\/letterboxd\.com/);

    const bookResult = socialScraper.createReviewPost({
      id: 'hardcover-review-456',
      title: 'Example Book',
      rating: '4',
      review: 'A detailed book review with enough text to use as its description.',
      reviewDate: '2026-06-02T12:30:00+00:00',
      link: 'https://hardcover.app/books/example-book'
    }, 'hardcover', 'Hardcover', { contentDir });

    const bookPost = fs.readFileSync(bookResult.filePath, 'utf8');
    assert.match(bookPost, /tags: \["Review","Book"\]/);
    assert.match(bookPost, /review_source: "hardcover"/);
    assert.match(bookPost, /\[View this review on Hardcover\]\(https:\/\/hardcover\.app/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('Hardcover tokens accept either raw values or an existing Bearer prefix', () => {
  assert.equal(getHardcoverReviews.authorizationHeader('abc'), 'Bearer abc');
  assert.equal(getHardcoverReviews.authorizationHeader('Bearer abc'), 'Bearer abc');
});
