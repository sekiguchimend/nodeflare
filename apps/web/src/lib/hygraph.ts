const HYGRAPH_ENDPOINT = 'https://api-us-west-2.hygraph.com/v2/cmmky48hh00h006w5q885vkcf/master';
const HYGRAPH_TOKEN = process.env.HYGRAPH_TOKEN || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImdjbXMtbWFpbi1wcm9kdWN0aW9uIn0.eyJ2ZXJzaW9uIjozLCJpYXQiOjE3NzM5NDAxMDIsImF1ZCI6WyJodHRwczovL2FwaS11cy13ZXN0LTIuaHlncmFwaC5jb20vdjIvY21ta3k0OGhoMDBoMDA2dzVxODg1dmtjZi9tYXN0ZXIiLCJtYW5hZ2VtZW50LW5leHQuZ3JhcGhjbXMuY29tIl0sImlzcyI6Imh0dHBzOi8vbWFuYWdlbWVudC11cy13ZXN0LTIuaHlncmFwaC5jb20vIiwic3ViIjoiZjE5MGM5MzAtNzg4NS00ODFlLWE5ZDctNmY1YjE3YjlkNGY3IiwianRpIjoiY21teHE0djFkMDJ2ZzA3bG1majg0N2gxdSJ9.zWAHGWGtFqip2Q21GgEtqYoatdZMPt1anJOplZIo1YnKIPw0JidKVAkx9UC6qWcptHHotxHFD3qSSoQUa9w6RnRQeysS3ussVFdBwSRetdudyd6N4UgLUfTb-A-1hOKHR3h8NX18wgUoZakSsCP5f2W72rfM9EMgzWkKotN0eaoaKdFMrfjRWL50pcD7Z-QX5CwbzPxKJKZ_oiyZdKCSkz9RzjZBbZF-NeBMHdR0EWuTb8GDzQ3aZr-GcXCv-c2TU94GYgBAMTomKcY_cdKQY7p_Tdaq_3zNBci3L9uRf3ZfbI6U3zaCKw6vlujL3LiKkuPef48oH8mUtI4LRYEgfIeMJpbIy6bF6va0uFjuETLNVOj-FJhqSpZ3EiGkDvMkkBpXBKDy--HcGLZLD3nu-iwdOr1-OHBPlh4_XM5b2dyaRmhpPgbGpnr8cuNAoF3Vlo3-jAP76d_EMy12wkmFPN8f_wdG_qgKRwvmTVjGFyvQ7bWhonUrdg0DbAkF0d0NaDZIKYA7rT8UlBIDqHT0QmIg07dr-RLiATgGXD-KHPJK0murBvmHmoJeLWXpuY-k0eyF0FedUNhW1MOzCQ8xbtWLmTL5ZYn1cVJEyFls53qxQuq4MOWeWhwwCtiQs2e79zz11AmqJbPV0m3p3vAkTVe4P-nf3hbV58b4c9BUZAk';

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
