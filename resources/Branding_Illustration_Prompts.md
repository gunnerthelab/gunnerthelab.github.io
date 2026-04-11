# The Adventures of Gunner the Lab... Oh, and Tiger Too

## Branding & Social Media Illustration Prompts

### Character Reference Guide

**Gunner:** Large black Labrador Retriever, solid black coat, warm amber/brown eyes, hunter safety orange collar, broad chest, muscular build, floppy ears, big happy grin with tongue out when excited. About 90 pounds of enthusiasm.

**Tiger:** Tabby cat, gray and brown striped fur with classic tabby markings (dark stripes on lighter gray-brown base), golden/amber eyes, slightly stocky build, alert pointed ears, long whiskers. NOT orange. Carries himself like royalty.

**Dad:** Stocky build, beard/scruff, wears denim overalls (Dickies brand) and a wide-brimmed sun hat.

**Mom:** Busy, capable, always in motion. Practical clothing. Warm smile.

**The Three Boys:** Oldest is sturdy and serious (around 14-15). Middle is dreamy and imaginative (around 12-13). Youngest is small, wild-eyed, and perpetually in motion (around 10-11).

---

## Phase 1 Asset Map — What Exists vs. What's Needed

| Asset | File in Repo | Size | Action |
|---|---|---|---|
| Favicon (32×32, 64×64) | `public/favicon.png` | 2048×2048 | Resize down |
| App Icon master (1024×1024) | `public/images/paw-paw-logo.png` | 1024×1024 | ✅ Already correct size |
| apple-touch-icon (180×180) | ❌ Missing | — | Export from paw-paw-logo |
| Website header logo | `public/images/typewriter-logo.png` | 2048×2048 | ✅ Already in use |
| OG / social default image (1200×630) | `public/images/duo-emblem.png` | 2048×2048 (square) | Generate Prompt 8b (landscape) |
| Website hero 16:9 | `public/images/full-adventure-hero-cover.png` | 2752×1536 | Resize to 1920×1080 |
| Website hero alternate | `public/images/title-card-hero.png` | 2752×1536 | Resize to 1920×1080 |
| Instagram profile square | `public/images/gunner-tiger-simple-profile.png` | 2048×2048 | Resize to 1080×1080 |
| Instagram profile alternate | `public/images/tiger-laying-on-gunner.png` | 2048×2048 | Resize to 1080×1080 |
| Family portrait social | `public/images/family-gunner-tiger.png` | 2048×2048 | Resize to 1080×1080 |
| Facebook/Twitter banner (1500×500) | `public/images/porch-scene.png` | 1792×592 (3:1 ✅) | Upscale/resize |
| Story card thumbnail 2:3 | `public/images/story-card-template.png` | 1696×2528 | Resize to 800×1200 |
| YouTube banner (2560×1440) | ❌ Missing | — | Generate Prompt 12 |
| site.webmanifest | ❌ Missing | — | Code file (no image needed) |

---

## Social Media Profile Image

**Prompt 1 — The Family Portrait:**
Colored pencil illustration, warm textured hand-drawn storybook style. A family portrait on a Virginia farmhouse porch. Center: a large black Labrador (Gunner) with a hunter safety orange collar sitting proudly, tongue out, tail wagging. To his right, a gray-brown tabby cat (Tiger) sitting upright with a look of dignified tolerance. Behind them: Dad in denim overalls and sun hat with his arm around Mom. Three boys arranged around them — the oldest standing tall and steady, the middle one slightly dreamy-eyed, the youngest mid-motion as if he can't hold still for the photo. Virginia mountains and woods in the background. Golden hour light. Warm earthy tones. The feeling of a real family who happens to live with the world's goofiest dog and the world's most strategic cat. Square crop, centered composition.
**Output size: 1080×1080 (square). Save as: `family-portrait-social.png`**

**Prompt 2 — Gunner & Tiger Only (Simple Profile):**
Colored pencil illustration, warm storybook style. Close-up portrait of a large black Labrador (Gunner) with a hunter safety orange collar, big goofy grin, tongue out, amber eyes full of joy. Beside him, a gray-brown tabby cat (Tiger) with golden eyes, sitting upright, expression of calm superiority. Their heads are close together. Gunner looks thrilled. Tiger looks like he's tolerating this. Warm cream background. Square crop, character portrait. Hand-drawn colored pencil texture, soft shading.
**Output size: 1080×1080. Existing file: `gunner-tiger-simple-profile.png` (2048×2048) — resize to 1080×1080 to use. Save new generation as: `gunner-tiger-profile-v2.png`**

**Prompt 3 — Tiger on Gunner (The Classic):**
Colored pencil illustration. A gray-brown tabby cat (Tiger) curled up on top of a sleeping black Labrador (Gunner) who is sprawled on a rug by a heater. The cat looks directly at the viewer with an expression that says "yes, this is my throne." The dog is oblivious, dreaming. Warm interior light. Square crop. Cozy, intimate, the defining image of their friendship. (Reference: actual photo of Tiger on Gunner)
**Output size: 1080×1080. Existing file: `tiger-laying-on-gunner.png` (2048×2048) — resize to 1080×1080 to use. Save new generation as: `tiger-on-gunner-profile-v2.png`**

---

## Website Hero / Cover Image

**Prompt 4 — The Full Adventure:**
Colored pencil illustration, wide panoramic composition (16:9 aspect ratio). A Virginia mountain landscape at golden hour. In the foreground, a large black Lab (Gunner) with an orange collar runs joyfully through a meadow, ears flapping, tongue out. A gray-brown tabby cat (Tiger) trots beside him with composed dignity. Behind them, a farmhouse on a hill with a porch. Three boys run in the distance. Dad in overalls watches from the porch. The Virginia mountains stretch across the background, blue and purple in the evening light. Wildflowers in the meadow. Fireflies beginning to glow. The whole scene feels like the opening page of a storybook. Warm colored pencil illustration, rich textures, hand-drawn feel, children's book quality.
**Output size: 1920×1080. Existing file: `full-adventure-hero-cover.png` (2752×1536) — resize to 1920×1080 to use. Save new generation as: `full-adventure-hero-v2.png`**

**Prompt 5 — The Porch Scene (Horizontal Banner):**
Colored pencil illustration, wide horizontal composition (3:1 aspect ratio). A Virginia farmhouse porch at sunset. From left to right: a pair of muddy boots by the door, a tabby cat (Tiger) sitting on the porch railing surveying his kingdom, a black Lab (Gunner) sprawled on the porch floor with a chew toy, three pairs of boys' sneakers scattered around, and a rocking chair with a sun hat hanging on it. The porch tells the story of the whole family without showing a single person. Mountains and woods glow in the background. Warm golden light. Colored pencil illustration, rich detail in every object, storybook atmosphere.
**Output size: 1500×500 (Facebook/Twitter/X banner, 3:1). Existing file: `porch-scene.png` (1792×592, already 3:1) — resize/crop to 1500×500 to use. Save new generation as: `porch-scene-banner-v2.png`**

**Prompt 6 — Title Card Hero:**
Colored pencil illustration, horizontal composition (16:9). A black Lab (Gunner) with a hunter safety orange collar sitting at the top of a grassy Virginia hill, looking out over forty acres of woods and mountains. A tabby cat (Tiger) sits beside him, slightly behind, watching the same view. They're silhouetted against a warm sunset sky. Open space above and below for text overlay. The composition should leave room at the top for the series title "The Adventures of Gunner the Lab... Oh, and Tiger Too" and at the bottom for a tagline. Colored pencil illustration, epic but warm, the feeling of two friends looking out at their world.
**Output size: 1920×1080. Existing file: `title-card-hero.png` (2752×1536) — resize to 1920×1080 to use. Save new generation as: `title-card-hero-v2.png`**

---

## Logo Concepts

**Prompt 7 — Paw & Paw Logo:**
Colored pencil illustration on white background. A single dog paw print (large, black) overlapping with a single cat paw print (smaller, gray-brown tabby pattern). The dog paw has a tiny orange collar charm hanging from it. Simple, clean, recognizable. Could work as a favicon or app icon. Hand-drawn colored pencil texture, minimal design, storybook charm. Square format.
**Output size: 1024×1024 master. Existing file: `paw-paw-logo.png` (1024×1024) — already ✅ the right size. Use for app icon master and favicon. Export sub-sizes: 512×512, 256×256, 180×180 (apple-touch-icon), 128×128, 64×64, 32×32.**

**Prompt 8 — The Duo Emblem (Square):**
Colored pencil illustration. Circular emblem design. Inside the circle: a black Lab's head (Gunner) in profile facing right, with a tabby cat's head (Tiger) in profile facing left, back to back. Gunner grins with tongue out. Tiger looks composed and slightly smug. A hunter safety orange collar is visible on Gunner. The circle border is made of a hand-drawn pencil line with small paw prints. Below the circle, a banner ribbon with space for text. Warm cream background. Storybook emblem style, hand-drawn feel.
**Output size: 2048×2048 master. Existing file: `duo-emblem.png` (2048×2048) — already ✅ in use as OG image but is square. See Prompt 8b for OG-optimized landscape version.**

**Prompt 8b — Duo Emblem OG Image (landscape, NEW — needs generation):**
Colored pencil illustration, horizontal landscape format (1200×630, approximately 2:1 aspect ratio). The same circular Duo Emblem (black Lab head facing right, tabby cat head facing left, back to back, paw print border) centered in the composition. Warm cream/parchment background fills the sides. To the left of the emblem in the background: soft suggestion of Virginia mountains. To the right: a hint of a farmhouse porch. The series title "The Adventures of Gunner the Lab... Oh, and Tiger Too" appears below the emblem in the hand-drawn typewriter font style, fitting cleanly within the horizontal frame. Brand colors: hunter safety orange (#E87A2E), warm brown (#3B2412), cream (#FDF6EC). Storybook illustration style, professional quality, hand-drawn colored pencil texture, warm color palette.
**Output size: 1200×630. Save as: `og-default-image.png`. Used for social media link previews (Facebook, Twitter/X, iMessage, Slack, Discord).**

**Prompt 9 — Silhouette Logo:**
Simple colored pencil illustration on white background. Silhouette of a large dog (Lab shape) sitting, with a small cat sitting beside him, leaning against the dog's side. The dog's tail curls up. The cat's tail curls around the dog's paw. Just the outlines and silhouettes — minimal, elegant, instantly recognizable. The dog silhouette is solid black, the cat silhouette is gray with subtle stripe texture. A small orange dot for the collar. Could work at any size from favicon to billboard.
**Output size: 2048×2048 master. Existing file: `silhouette-logo.png` (2048×2048) — resize to needed sub-sizes. Alternate app icon / favicon candidate.**

**Prompt 10 — Typewriter Logo:**
Hand-lettered title treatment in colored pencil: "The Adventures of Gunner the Lab..." in a warm, slightly imperfect hand-drawn serif font, with "Oh, and Tiger Too" written smaller below in a lighter, more casual script, as if Tiger added it himself as an afterthought. A tiny paw print dots the period. A small tabby cat silhouette sits on top of the letter "G" in Gunner. Warm brown and orange tones. Textured paper background. The typography itself is the logo.
**Output size: 2048×2048 or wider horizontal. Existing file: `typewriter-logo.png` (2048×2048) — ✅ already in use in website header.**

---

## Social Media Banners

**Prompt 11 — Facebook/Twitter Banner (Wide):**
Colored pencil illustration, wide horizontal format (3:1 ratio, 1500×500 pixels). A panoramic Virginia landscape with rolling mountains. In the center foreground, a large black Labrador (Gunner) with a hunter safety orange collar and a gray-brown tabby cat (Tiger) with golden eyes walk side by side down a dirt road that stretches into the distance. Gunner's tail is up and wagging. Tiger walks with quiet purpose. Autumn leaves blow across the road. The road leads toward a farmhouse in the distance. Space on either side for an account name or tagline. Warm fall colors, hand-drawn storybook quality.
**Output size: 1500×500 (Facebook/Twitter/X). Existing file: `porch-scene.png` (1792×592, already 3:1) is a viable substitute — resize to 1500×500. Save new generation as: `social-banner-facebook.png`**

**Prompt 12 — YouTube/Channel Banner (NEW — needs generation):**
Colored pencil illustration, extra wide horizontal format (2560×1440, approximately 16:9 but displayed as a wide banner). A continuous scene reading left to right like a story across the full width: on the far left, an East Texas farmhouse with chickens in the yard and a young black Lab puppy (Gunner, small, gangly, no collar yet) chasing them. In the center, a packed car driving down a long highway, a dog's head out the window, a cat carrier in the back seat. On the far right, a Virginia mountain homestead, an adult black Labrador (Gunner, big and proud, hunter safety orange collar) and a gray-brown tabby cat (Tiger) sitting together on a porch, looking out at forty acres of mountains. The whole journey in one image. Graphite pencil on the left transitioning to full colored pencil on the right, mirroring the art style shift in the story series. Keep important subjects within the center safe zone (1235×421 pixels, centered) as YouTube crops the sides on some devices.
**Output size: 2560×1440. No existing file — needs generation. Save as: `youtube-channel-banner.png`**

---

## Story Card / Thumbnail Template

**Prompt 13 — Story Card Template (Vertical):**
Colored pencil illustration, vertical format (2:3 ratio). A warm parchment/cream colored background with a subtle pencil-texture border. At the top, a small circular vignette illustration area (for individual story art). Below it, space for story title text. At the bottom, small silhouettes of a black Lab and a tabby cat walking together. The border has tiny paw prints running along it. Decorative corners with small acorn and leaf details. The template should feel like a page from a handmade storybook. Warm tones throughout.

**Prompt 14 — Era Divider Cards:**
A set of small colored pencil vignette illustrations, each representing a story era:
- **East Texas:** A flat horizon with a fence post, a barn, and a setting sun. Graphite pencil style, black and white.
- **Big Moves:** A packed truck on a long highway. Graphite transitioning to color.
- **Virginia:** Mountain ridgeline with trees and a farmhouse. Full colored pencil.
- **Family:** A porch with boots, a dog toy, and a cat on the railing. Colored pencil.
- **Seasonal:** Four small panels — snow, fireworks, spring garden, Christmas tree. Colored pencil.
- **Adventure:** A trail disappearing into dark woods with paw prints. Colored pencil.
- **Heart:** An empty porch with soft evening light. Graphite pencil, extra soft.

---

## Merchandise / Print-Ready Designs

**Prompt 15 — T-Shirt Design:**
Colored pencil illustration on transparent/white background. A black Lab (Gunner) sitting with a huge goofy grin, tongue out, hunter safety orange collar visible. A tabby cat (Tiger) sits on top of his head, looking out with calm authority, one paw resting on Gunner's ear. Below them, hand-lettered text: "He's the star. I'm the brains." Simple, clean, funny. Would work on a t-shirt, mug, or tote bag. Bold enough to read at a distance.

**Prompt 16 — Bumper Sticker / Decal:**
Simple colored pencil illustration, horizontal rectangle. Silhouette of a black Lab and a tabby cat sitting side by side, looking at the viewer. The dog's tail wags. The cat's tail curls. Text beside them: "gunnerthelab.com" in a warm hand-drawn font. Hunter safety orange accent line below. Clean enough to work as a vinyl decal or bumper sticker at 3x10 inches.

**Prompt 17 — Bookplate / Ex Libris:**
Colored pencil illustration, vertical rectangle. A decorative bookplate design reading "From the Library of..." with an illustration of a black Lab lying on a stack of books while a tabby cat sits on top of the highest book, reading. Small paw print details in the corners. Warm, literary, charming. Hand-drawn border with vine and acorn details. Storybook quality.

---

## Seasonal Social Media Posts

**Prompt 18 — Christmas Post:**
Colored pencil illustration, square format. A black Lab (Gunner) wearing a Santa hat (crooked), sitting in front of a Christmas tree, tangled in lights. A tabby cat (Tiger) sits beside the tree, one paw on an ornament he's clearly about to bat off. A half-eaten Christmas ham is visible on a counter behind them. Warm holiday lighting, cozy interior. Text space at bottom for holiday greeting.

**Prompt 19 — Summer Post:**
Colored pencil illustration, square format. A black Lab (Gunner) mid-leap into a pond, water splashing everywhere, pure joy on his face. On the bank, a tabby cat (Tiger) sits under an umbrella, dry, watching with an expression that says "absolutely not." Virginia summer landscape, blue sky, green trees. Bright, warm, fun.

**Prompt 20 — Fall Post:**
Colored pencil illustration, square format. A black Lab (Gunner) lying in a massive pile of raked leaves, only his head and orange collar visible, looking delighted. A tabby cat (Tiger) sits on a neatly raked section of yard nearby, surrounded by zero leaves, looking pristine. Behind them, Virginia mountains in full autumn color. A rake lies abandoned in the background.

---

## Notes

- **All prompts specify colored pencil illustration** for branding consistency with the current-era stories
- **Always include** "hunter safety orange collar" for Gunner and "gray and brown tabby, NOT orange" for Tiger
- **Add quality tags** to all prompts: "storybook illustration style, professional quality, hand-drawn colored pencil texture, warm color palette"
- **For social media sizing:** Instagram = square (1:1), Facebook cover = 2.63:1, Twitter/X banner = 3:1, YouTube = 6:1
- **For print:** Request 300 DPI and specify dimensions in inches
- **Brand colors to reference:** Hunter safety orange (#E87A2E), warm brown (#3B2412), cream (#FDF6EC), forest green (#2D5F2D)
