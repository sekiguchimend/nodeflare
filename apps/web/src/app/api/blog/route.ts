import { NextResponse } from 'next/server';
import { getBlogPosts } from '@/lib/hygraph';

export const revalidate = 60;

export async function GET() {
  // Return empty array if Hygraph is not configured
  if (!process.env.HYGRAPH_TOKEN) {
    return NextResponse.json([]);
  }

  try {
    const posts = await getBlogPosts();
    return NextResponse.json(posts);
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
    return NextResponse.json([]);
  }
}
