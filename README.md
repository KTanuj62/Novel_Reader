# Novel Audio Reader 🎧

An automated web novel audiobook player that reads chapters aloud using browser-native text-to-speech, auto-advances to the next chapter, and supports playback speeds from 0.25x to 4x.

## Features

- 📖 **Paste & Play**: Simply paste any novel chapter URL and start listening
- 🔊 **Text-to-Speech**: Uses browser-native Web Speech API (no external dependencies)
- ⚡ **Variable Speed**: Adjust playback speed from 0.25x to 4x in 0.25x increments
- 🔄 **Auto-Advance**: Automatically loads and reads the next chapter
- 🛑 **Auto-Stop**: Stops after 10 chapters or manual stop
- ⏸️ **Full Controls**: Play, pause, resume, and stop
- 📊 **Progress Tracking**: Real-time progress bar for current chapter
- 📱 **Mobile-Friendly**: Optimized for mobile devices (perfect for listening on the go)

## Deployment to Vercel

### Quick Deploy

1. Push this project to GitHub

2. Go to [Vercel](https://vercel.com)

3. Click "New Project" and import your GitHub repository

4. Vercel will auto-detect Next.js and configure everything

5. Click "Deploy"

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from the novel-reader directory
cd novel-reader
vercel
```

Follow the prompts, and your app will be live!

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use

1. Open the web app on your mobile device (Chrome recommended)
2. Paste a novel chapter URL (e.g., from novelfire.net)
3. Adjust playback speed if desired (default is 1.0x)
4. Click "Start Reading"
5. The app will:
   - Fetch the chapter content
   - Read it aloud using TTS
   - Automatically load and read the next chapter
   - Continue for up to 10 chapters or until you stop it

Perfect for hands-free listening while riding your bike! 🚴

## Supported Websites

Currently optimized for:
- novelfire.net

The parser can be extended to support other novel websites by updating the selectors in the API route.

## Technical Details

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS
- **Text-to-Speech**: Web Speech API (SpeechSynthesis)
- **Parsing**: Cheerio for server-side HTML parsing
- **Deployment**: Optimized for Vercel

## Browser Compatibility

- ✅ Chrome (Desktop & Mobile) - Best experience
- ✅ Edge (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile)
- ⚠️ Firefox - Limited TTS voice options

## Notes

- Make sure to allow audio autoplay in your browser settings
- On mobile, keep the browser tab active for uninterrupted playback
- The app proxies requests through the API route to avoid CORS issues
- Voice quality depends on your device's built-in TTS engine
