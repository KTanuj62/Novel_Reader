import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch the novel page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
      cache: 'no-store',
    });

    let html = '';
    let fallbackText = '';

    if (response.ok) {
      html = await response.text();
    } else if (response.status === 403 || response.status === 429) {
      const sanitizedUrl = url.replace(/^https?:\/\//, '');
      const fallbackResponse = await fetch(`https://r.jina.ai/http://${sanitizedUrl}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        cache: 'no-store',
      });

      if (fallbackResponse.ok) {
        fallbackText = await fallbackResponse.text();
      } else {
        return NextResponse.json(
          { error: 'Failed to fetch chapter' },
          { status: response.status }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Failed to fetch chapter' },
        { status: response.status }
      );
    }

    const $ = html ? cheerio.load(html) : cheerio.load('<div></div>');

    // Extract chapter content - adjust selectors based on the website structure
    // NovelFire.net specific selectors
    const chapterTitle = $('.chapter-title, .title, h1').first().text().trim();
    
    // Get chapter content - try multiple possible selectors
    let chapterContent = '';
    const contentSelectors = [
      '#chapter-container',
      '.chapter-content',
      '.content',
      '#content',
      '.reading-content',
      'article',
    ];

    for (const selector of contentSelectors) {
      const content = $(selector).first();
      if (content.length > 0) {
        // Remove scripts, styles, and ads
        content.find('script, style, .ad, .advertisement, .social-share').remove();
        chapterContent = content.text().trim();
        if (chapterContent.length > 100) {
          break;
        }
      }
    }

    // If still no content, try to get all paragraphs
    if (!chapterContent || chapterContent.length < 100) {
      chapterContent = $('p')
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((text) => text.length > 20)
        .join('\n\n');
    }

    // If blocked and we have fallback text, use it as content
    if ((!chapterContent || chapterContent.length < 100) && fallbackText) {
      chapterContent = fallbackText
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Find next chapter link
    let nextChapterUrl = '';
    const nextLinkSelectors = [
      'a.next-chapter',
      'a.next',
      'a[rel="next"]',
      '.chapter-nav a:contains("Next")',
      'a:contains("Next Chapter")',
      '.next-chap',
    ];

    for (const selector of nextLinkSelectors) {
      const nextLink = $(selector).first();
      if (nextLink.length > 0) {
        const href = nextLink.attr('href');
        if (href) {
          // Handle relative URLs
          nextChapterUrl = href.startsWith('http')
            ? href
            : new URL(href, url).toString();
          break;
        }
      }
    }

    // If no next link found, try to extract from current URL pattern
    if (!nextChapterUrl) {
      const chapterMatch = url.match(/chapter-(\d+)/);
      if (chapterMatch) {
        const currentChapter = parseInt(chapterMatch[1]);
        nextChapterUrl = url.replace(
          /chapter-\d+/,
          `chapter-${currentChapter + 1}`
        );
      }
    }

    return NextResponse.json({
      title: chapterTitle,
      content: chapterContent,
      nextChapterUrl,
      currentUrl: url,
    });
  } catch (error) {
    console.error('Error fetching chapter:', error);
    return NextResponse.json(
      { error: 'Failed to parse chapter content' },
      { status: 500 }
    );
  }
}
