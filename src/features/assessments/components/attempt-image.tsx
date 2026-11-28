'use client';

import { AuthenticatedImage } from '@/components/shared/authenticated-image';

export function AttemptImage({ image }: { image: { src: string; alt: string } }) {
  return <AuthenticatedImage image={image} />;
}
