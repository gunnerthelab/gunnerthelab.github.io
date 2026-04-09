import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import siteConfig from '../data/site-config.ts';
import { sortStoriesByOrder } from '../utils/data-utils.ts';

export async function GET(context) {
    const stories = (await getCollection('stories', ({ data }) => !data.draft)).sort(sortStoriesByOrder);
    return rss({
        title: siteConfig.title,
        description: siteConfig.description,
        site: context.site,
        items: stories.map((item) => ({
            title: `Story #${item.data.storyNumber}: ${item.data.title}`,
            description: item.data.description,
            link: `/stories/${item.id}/`,
            pubDate: item.data.publishDate.setUTCHours(0)
        }))
    });
}
