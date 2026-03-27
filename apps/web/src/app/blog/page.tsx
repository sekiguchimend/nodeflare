import { Header, Footer } from '@/components/layout';
import Link from 'next/link';
import { getBlogPosts } from '@/lib/hygraph';

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const revalidate = 60;

export default async function BlogPage() {
  // Return empty array if Hygraph is not configured
  let posts: Awaited<ReturnType<typeof getBlogPosts>> = [];
  if (process.env.HYGRAPH_TOKEN) {
    try {
      posts = await getBlogPosts();
    } catch {
      // Fail gracefully
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Blog</h1>
          <p className="text-gray-600">最新の技術情報をお届けします</p>
        </div>

        {/* Posts Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-gradient-to-br from-violet-500 to-purple-600 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/80 text-4xl font-bold">
                    {post.title.charAt(0)}
                  </span>
                </div>
                {post.categories[0] && (
                  <span className="absolute top-3 left-3 text-xs font-medium text-white bg-black/30 backdrop-blur-sm px-2 py-1 rounded">
                    {post.categories[0].name}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <h2 className="font-semibold text-gray-900 group-hover:text-violet-600 transition-colors line-clamp-2 mb-2">
                  {post.title}
                </h2>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  {post.author && <span>{post.author.name}</span>}
                  {post.author && post.publishDate && <span>·</span>}
                  {post.publishDate && <span>{formatDate(post.publishDate)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500">まだ記事がありません</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
