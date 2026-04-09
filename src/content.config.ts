import { glob } from 'astro/loaders';
import { defineCollection, z, type ImageFunction } from 'astro:content';

const imageSchema = (image: ImageFunction) =>
    z.object({
        src: image(),
        alt: z.string().optional()
    });

const seoSchema = (image: ImageFunction) =>
    z.object({
        title: z.string().min(5).max(120).optional(),
        description: z.string().min(15).max(160).optional(),
        image: imageSchema(image).optional(),
        pageType: z.enum(['website', 'article']).default('website')
    });

const stories = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/stories' }),
    schema: ({ image }) =>
        z.object({
            title: z.string(),
            storyNumber: z.number(),
            subtitle: z.string().optional(),
            era: z.enum([
                'virginia',
                'east-texas',
                'big-moves',
                'boys-and-family',
                'seasonal',
                'adventure',
                'heart'
            ]),
            eraLabel: z.string(),
            description: z.string(),
            publishDate: z.coerce.date(),
            coverImage: z.string().optional(),
            artStyle: z.enum(['graphite', 'colored-pencil']).optional(),
            draft: z.boolean().default(false),
            order: z.number().optional(),
            seo: seoSchema(image).optional()
        })
});

const pages = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
    schema: ({ image }) =>
        z.object({
            title: z.string(),
            seo: seoSchema(image).optional()
        })
});

export const collections = { stories, pages };
