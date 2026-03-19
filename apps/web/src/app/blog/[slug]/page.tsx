import { Header, Footer } from '@/components/layout';
import Link from 'next/link';
import { getBlogPost, getBlogPosts } from '@/lib/hygraph';
import { notFound } from 'next/navigation';

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export const revalidate = 60;

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return { title: '記事が見つかりません' };
  }

  return {
    title: `${post.title} | ブログ`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-3xl mx-auto px-6 py-20">
        {/* Back Link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-12"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          記事一覧
        </Link>

        <article>
          {/* Header */}
          <header className="mb-12">
            {/* Categories */}
            <div className="flex items-center gap-2 mb-6">
              {post.categories.map((category) => (
                <span
                  key={category.id}
                  className="text-xs font-medium text-violet-600 bg-violet-100 px-3 py-1 rounded-full"
                >
                  {category.name}
                </span>
              ))}
            </div>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-4">
              {post.author && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-violet-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium">
                      {post.author.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{post.author.name}</p>
                    {post.publishDate && (
                      <time className="text-sm text-gray-500">
                        {formatDate(post.publishDate)}
                      </time>
                    )}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Excerpt */}
          {post.excerpt && (
            <div className="mb-10 pb-10 border-b border-gray-100">
              <p className="text-xl text-gray-600 leading-relaxed">
                {post.excerpt}
              </p>
            </div>
          )}

          {/* Content */}
          {post.content?.html && (
            <div
              className="prose prose-lg max-w-none
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-gray-600 prose-p:leading-relaxed prose-p:mb-6
                prose-a:text-violet-600 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-gray-900
                prose-code:text-violet-600 prose-code:bg-violet-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-gray-900 prose-pre:rounded-xl prose-pre:shadow-lg
                prose-ul:my-6 prose-li:text-gray-600 prose-li:marker:text-gray-400
                prose-blockquote:border-l-violet-500 prose-blockquote:bg-gray-50 prose-blockquote:py-1 prose-blockquote:not-italic"
              dangerouslySetInnerHTML={{ __html: post.content.html }}
            />
          )}

          {/* Author Bio */}
          {post.author?.bio && (
            <div className="mt-16 pt-10 border-t border-gray-100">
              <div className="flex items-start gap-5 bg-gray-50 rounded-2xl p-6">
                <div className="w-14 h-14 bg-gradient-to-br from-violet-400 to-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xl">
                    {post.author.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">著者</p>
                  <p className="font-bold text-gray-900 mb-2">{post.author.name}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{post.author.bio}</p>
                </div>
              </div>
            </div>
          )}
        </article>

        {/* Navigation */}
        <div className="mt-16 pt-10 border-t border-gray-100">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            他の記事を読む
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
