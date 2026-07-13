import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Attune — Understand them before you talk to them.';

const ELEMENT_DOTS = ['#4E8A52', '#C4502E', '#A8842C', '#6E7A80', '#4A76AC'];

export default async function Image() {
  const frauncesSemiBold = fs.readFileSync(
    path.join(process.cwd(), 'src/app/og/fonts/Fraunces-SemiBold.ttf'),
  );
  const spaceMonoRegular = fs.readFileSync(
    path.join(process.cwd(), 'src/app/og/fonts/SpaceMono-Regular.ttf'),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: '#F1EDE6',
          color: '#1A1815',
          position: 'relative',
          fontFamily: 'Fraunces',
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 96,
            fontFamily: 'Space Mono',
            fontSize: 22,
            letterSpacing: 7,
            color: '#7D7466',
          }}
        >
          ATTUNE
        </div>

        {/* Five-element dots */}
        <div
          style={{
            position: 'absolute',
            top: 68,
            right: 96,
            display: 'flex',
            flexDirection: 'row',
            gap: 14,
          }}
        >
          {ELEMENT_DOTS.map(color => (
            <div
              key={color}
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                background: color,
              }}
            />
          ))}
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Fraunces',
            fontWeight: 600,
            fontSize: 74,
            lineHeight: 1.06,
            letterSpacing: -1,
            color: '#1A1815',
          }}
        >
          <span>Understand them</span>
          <span style={{ display: 'flex' }}>
            <span style={{ color: '#C4502E' }}>before</span>
            <span style={{ whiteSpace: 'pre' }}>{' '}</span>
            <span>you talk to them.</span>
          </span>
        </div>

        {/* Subline */}
        <div
          style={{
            marginTop: 28,
            fontFamily: 'Space Mono',
            fontSize: 20,
            color: '#55503F',
          }}
        >
          Four Pillars, read like a friend. No account. Free.
        </div>

        {/* Footer left */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 96,
            fontFamily: 'Space Mono',
            fontSize: 19,
            letterSpacing: 1.5,
            color: '#7D7466',
          }}
        >
          attune-silk.vercel.app
        </div>

        {/* Footer right */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 96,
            fontFamily: 'Space Mono',
            fontSize: 15,
            letterSpacing: 2,
            color: '#A89F8E',
          }}
        >
          SAJU, DECODED
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Fraunces', data: frauncesSemiBold, style: 'normal', weight: 600 },
        { name: 'Space Mono', data: spaceMonoRegular, style: 'normal', weight: 400 },
      ],
    },
  );
}
