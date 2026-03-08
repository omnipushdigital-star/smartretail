import React from 'react'

interface MetaTagsProps {
    title: string
    description?: string
    image?: string
    url?: string
}

export default function MetaTags({
    title,
    description = "OmniPush: The Enterprise-Grade Smart Retail Display Management System. Cloud-based digital signage powered by Supabase & Cloudflare R2.",
    image = "https://signage.omnipushdigital.com/og-image.png", // Replace with a real OG image later
    url = "https://signage.omnipushdigital.com"
}: MetaTagsProps) {
    React.useEffect(() => {
        document.title = `${title} | OmniPush Digital`;

        // Update description
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.setAttribute('name', 'description');
            document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', description);

        // Update OG title
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (!ogTitle) {
            ogTitle = document.createElement('meta');
            ogTitle.setAttribute('property', 'og:title');
            document.head.appendChild(ogTitle);
        }
        ogTitle.setAttribute('content', `${title} | OmniPush Digital`);

        // Update OG image
        let ogImage = document.querySelector('meta[property="og:image"]');
        if (!ogImage) {
            ogImage = document.createElement('meta');
            ogImage.setAttribute('property', 'og:image');
            document.head.appendChild(ogImage);
        }
        ogImage.setAttribute('content', image);
    }, [title, description, image, url]);

    return null;
}
