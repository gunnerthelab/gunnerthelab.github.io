import type { SiteConfig } from '../types';

const siteConfig: SiteConfig = {
    website: 'https://gunnerthelab.com',
    title: 'Gunner the Lab',
    subtitle: 'The Adventures of Gunner the Lab... Oh, and Tiger Too',
    description: 'Mostly fictional. Always fun. Definitely Gunner\'s fault. A collection of illustrated short stories about a black lab named Gunner and his tabby cat sidekick Tiger.',
    image: {
        src: '/images/duo-emblem.png',
        alt: 'Gunner the black lab and Tiger the tabby cat — series emblem'
    },
    headerNavLinks: [
        {
            text: 'Home',
            href: '/'
        },
        {
            text: 'Stories',
            href: '/stories'
        },
        {
            text: 'About',
            href: '/about'
        }
    ],
    footerNavLinks: [
        {
            text: 'About',
            href: '/about'
        },
        {
            text: 'Stories',
            href: '/stories'
        }
    ],
    socialLinks: [],
    hero: {
        title: 'The Adventures of Gunner the Lab... Oh, and Tiger Too',
        image: {
            src: '/images/porch-scene.png',
            alt: 'Gunner the black lab and Tiger the tabby cat relaxing on the farmhouse porch at sunset with Virginia mountains in the background'
        },
        text: "**Mostly fictional. Always fun. Definitely Gunner's fault.**\n\nA collection of fun, illustrated short stories about a black lab named Gunner and his tabby cat sidekick Tiger — set across homesteads, road trips, and the kind of chaos only a loyal dog and a too-smart cat can create.",
        actions: [
            {
                text: 'Read Stories',
                href: '/stories'
            },
            {
                text: 'About the Series',
                href: '/about'
            }
        ]
    },
    subscribe: {
        enabled: false
    },
    postsPerPage: 20,
    projectsPerPage: 20
};

export default siteConfig;
