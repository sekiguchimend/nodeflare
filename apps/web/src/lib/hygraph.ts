import DOMPurify, { Config } from 'isomorphic-dompurify';

const HYGRAPH_ENDPOINT = process.env.HYGRAPH_ENDPOINT || 'https://api-us-west-2.hygraph.com/v2/cmmky48hh00h006w5q885vkcf/master';
// SECURITY: Token must be provided via environment variable - never commit tokens to code
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN;

if (!HYGRAPH_TOKEN) {
  console.warn('Warning: HYGRAPH_TOKEN environment variable not set. Blog features will be unavailable.');
}

// Configure DOMPurify with safe defaults
const DOMPURIFY_CONFIG: Config = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'strong', 'em', 'u', 's', 'sub', 'sup',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'figure', 'figcaption',
    'div', 'span',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id',
    'target', 'rel', 'width', 'height',
  ],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

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
 * Uses DOMPurify for robust protection against XSS vectors.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Use DOMPurify with strict configuration
  // RETURN_TRUSTED_TYPE: false ensures string return type
  return DOMPurify.sanitize(html, { ...DOMPURIFY_CONFIG, RETURN_TRUSTED_TYPE: false }) as string;
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
