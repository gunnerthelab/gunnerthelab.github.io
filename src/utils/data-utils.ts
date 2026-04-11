import { type CollectionEntry } from 'astro:content';

export function sortItemsByDateDesc(itemA: CollectionEntry<'stories'>, itemB: CollectionEntry<'stories'>) {
    return new Date(itemB.data.publishDate).getTime() - new Date(itemA.data.publishDate).getTime();
}

export function sortStoriesByOrder(itemA: CollectionEntry<'stories'>, itemB: CollectionEntry<'stories'>) {
    return (itemA.data.order ?? itemA.data.storyNumber) - (itemB.data.order ?? itemB.data.storyNumber);
}

export type EraGroup = {
    id: string;
    label: string;
    description: string;
    stories: CollectionEntry<'stories'>[];
};

const eraOrder = [
    'the-beginning',
    'east-texas',
    'big-moves',
    'virginia',
    'boys-and-family',
    'seasonal',
    'adventure',
    'heart'
];

const eraDescriptions: Record<string, string> = {
    'the-beginning': 'Phoenix & the Road East \u2014 Before the Lab',
    'east-texas': 'The Homestead Days \u2014 15 Acres',
    'big-moves': 'Road Trip / Transition Stories',
    'virginia': 'Current Setting \u2014 40 Acres',
    'boys-and-family': 'The Boys & Family Stories',
    'seasonal': 'Holiday Stories',
    'adventure': 'Adventure Stories',
    'heart': 'Heart Stories'
};

export function groupStoriesByEra(stories: CollectionEntry<'stories'>[]): EraGroup[] {
    const groups: Map<string, EraGroup> = new Map();

    for (const story of stories) {
        const era = story.data.era;
        if (!groups.has(era)) {
            groups.set(era, {
                id: era,
                label: story.data.eraLabel,
                description: eraDescriptions[era] ?? '',
                stories: []
            });
        }
        groups.get(era)!.stories.push(story);
    }

    // Sort stories within each group
    for (const group of groups.values()) {
        group.stories.sort(sortStoriesByOrder);
    }

    // Return groups in era display order
    return eraOrder
        .filter((era) => groups.has(era))
        .map((era) => groups.get(era)!);
}
