const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT || 'https://api-us-west-2.hygraph.com/v2/cmmky48hh00h006w5q885vkcf/master';
// SECURITY: Token must be provided via environment variable - never commit tokens to code
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN;

if (!HYGRAPH_TOKEN) {
  console.warn('Warning: HYGRAPH_TOKEN environment variable not set. Blog features will be unavailable.');
}

export interface Author {
  id: string;
  name: string;
  bio?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  content?: {
    html: string;
    text: string;
  };
  publishDate?: string;
  author?: Author;
  categories: Category[];
}

async function fetchHygraph<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!HYGRAPH_TOKEN) {
    throw new Error('HYGRAPH_TOKEN is not configured');
  }

  const res = await fetch(HYGRAPH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HYGRAPH_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 },
  });

  const json = await res.json();

  if (json.errors) {
    console.error('Hygraph errors:', json.errors);
    throw new Error(json.errors[0]?.message || 'GraphQL Error');
  }

  return json.data;
}

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Removes potentially dangerous elements and attributes.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, 'blocked:');

  // Remove data: URLs in src/href (can be used for XSS)
  sanitized = sanitized.replace(/(src|href)\s*=\s*["']data:[^"']*["']/gi, '$1="blocked"');

  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi, '');
  sanitized = sanitized.replace(/<(iframe|object|embed|form|input|button)[^>]*\/?>/gi, '');

  // Remove style tags (can be used for CSS-based attacks)
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove base tag (can redirect all links)
  sanitized = sanitized.replace(/<base[^>]*>/gi, '');

  return sanitized;
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const query = `
    query GetBlogPosts {
      blogPosts(orderBy: publishDate_DESC, stage: PUBLISHED) {
        id
        title
        slug
        excerpt
        publishDate
        author {
          id
          name
        }
        categories {
          id
          name
          slug
        }
      }
    }
  `;

  const data = await fetchHygraph<{ blogPosts: BlogPost[] }>(query);
  return data.blogPosts;
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const query = `
    query GetBlogPost($slug: String!) {
      blogPost(where: { slug: $slug }, stage: PUBLISHED) {
        id
        title
        slug
        excerpt
        content {
          html
          text
        }
        publishDate
        author {
          id
          name
          bio
        }
        categories {
          id
          name
          slug
        }
      }
    }
  `;

  const data = await fetchHygraph<{ blogPost: BlogPost | null }>(query, { slug });
  return data.blogPost;
}

export async function getCategories(): Promise<Category[]> {
  const query = `
    query GetCategories {
      categories(stage: PUBLISHED) {
        id
        name
        slug
      }
    }
  `;

  const data = await fetchHygraph<{ categories: Category[] }>(query);
  return data.categories;
}
