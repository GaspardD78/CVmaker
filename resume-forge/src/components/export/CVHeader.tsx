import { Profile } from '../../types/profile';
import { CVTemplate } from '../../types/template';

/** Tiny inline SVG icons for contact info (print-safe, no external deps) */
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.161V6a2 2 0 00-2-2H3z" />
      <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
    </svg>
  );
}
function LocationIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433a19.695 19.695 0 002.683-2.282c1.944-1.99 3.945-4.995 3.945-8.567a8 8 0 10-16 0c0 3.572 2.001 6.577 3.945 8.567a19.695 19.695 0 002.683 2.282 12.97 12.97 0 001.038.573l.018.008.006.003zM10 11.25a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5z" clipRule="evenodd" />
    </svg>
  );
}
function LinkedInIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path d="M4.5 2A2.5 2.5 0 002 4.5v11A2.5 2.5 0 004.5 18h11a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0015.5 2h-11zM7 7.5v6H5v-6h2zm-1-1.75a1 1 0 110-2 1 1 0 010 2zM15 13.5h-2v-2.938c0-.789-.6-1.062-1-.1062-.4 0-1 .312-1 1.062V13.5h-2v-6h2v.938s.75-1.188 2-1.188 2 .75 2 2.5v3.75z" />
    </svg>
  );
}
function GitHubIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path fillRule="evenodd" d="M10 1.5a8.5 8.5 0 00-2.688 16.568c.425.078.58-.184.58-.41 0-.201-.007-.735-.011-1.442-2.364.514-2.863-1.14-2.863-1.14-.387-.982-.944-1.243-.944-1.243-.771-.527.058-.516.058-.516.853.06 1.302.876 1.302.876.758 1.298 1.988.923 2.473.706.077-.549.297-.923.54-1.135-1.887-.215-3.873-.944-3.873-4.202 0-.928.332-1.687.876-2.281-.088-.214-.38-1.079.083-2.248 0 0 .714-.229 2.339.871A8.159 8.159 0 0110 4.999c.723.004 1.45.098 2.128.286 1.624-1.1 2.337-.871 2.337-.871.464 1.17.172 2.034.084 2.248.546.594.875 1.353.875 2.281 0 3.266-1.989 3.984-3.882 4.195.305.263.578.783.578 1.578 0 1.139-.01 2.057-.01 2.337 0 .228.153.493.585.41A8.502 8.502 0 0010 1.5z" clipRule="evenodd" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="mr-1 opacity-60" style={{ width: '14px', height: '14px', display: 'block', flexShrink: 0 }}>
      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.75 8.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM8 5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 018 5zm.75 9.25a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" />
    </svg>
  );
}

/** Shorten a URL for display */
function shortenUrl(url: string): string {
  try {
    let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    const linkedinMatch = clean.match(/linkedin\.com\/(in\/[^/?\s]+)/);
    if (linkedinMatch) return linkedinMatch[1];
    const githubMatch = clean.match(/github\.com\/([^/?\s]+)/);
    if (githubMatch) return githubMatch[1];
    clean = clean.replace(/\/$/, '');
    return clean;
  } catch {
    return url;
  }
}

/** Ensure a URL has a protocol for href */
function ensureHref(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  if (url.includes('@')) return `mailto:${url}`;
  return `https://${url}`;
}

interface CVHeaderProps {
  profile: Profile;
  title: string | null;
  template: CVTemplate;
  hasPhoto: boolean;
  photoShape: string;
  photoSize: string;
  photoBorder: string;
  primaryColor: string;
  isBanner: boolean;
  headerStyle: string;
  headerBlockStyle: React.CSSProperties;
  nameLineBreak: string;
}

export function CVHeader({
  profile, title, template, hasPhoto,
  photoShape, photoSize, photoBorder, primaryColor,
  isBanner, headerStyle, headerBlockStyle, nameLineBreak,
}: CVHeaderProps) {
  // Build contact items with icons
  const contactItems: { icon: React.ReactNode; text: string; href?: string }[] = [];
  if (profile.email) contactItems.push({ icon: <MailIcon />, text: profile.email, href: `mailto:${profile.email}` });
  if (profile.phone) contactItems.push({ icon: <PhoneIcon />, text: profile.phone, href: `tel:${profile.phone.replace(/\s/g, '')}` });
  if (profile.city) contactItems.push({ icon: <LocationIcon />, text: profile.city });
  if (profile.linkedinUrl) contactItems.push({ icon: <LinkedInIcon />, text: shortenUrl(profile.linkedinUrl), href: ensureHref(profile.linkedinUrl) });
  if (profile.githubUrl) contactItems.push({ icon: <GitHubIcon />, text: shortenUrl(profile.githubUrl), href: ensureHref(profile.githubUrl) });
  if (profile.portfolioUrl) contactItems.push({ icon: <GlobeIcon />, text: shortenUrl(profile.portfolioUrl), href: ensureHref(profile.portfolioUrl) });

  return (
    <div
      className={`cv-header-block ${hasPhoto ? 'flex items-center gap-6' : 'text-center'} ${!isBanner && headerStyle !== 'accent-light' ? 'mb-4 text-black dark:text-black' : ''}`}
      style={Object.keys(headerBlockStyle).length > 0 ? headerBlockStyle : undefined}
    >
      {hasPhoto && (() => {
        const size = photoSize || '96px';
        const shapeClass = photoShape || 'rounded-full';

        const borderStyle: React.CSSProperties = {};
        let borderClass = 'border-2 border-gray-200';
        let shadowClass = '';
        if (photoBorder === 'none') {
          borderClass = 'border-0';
        } else if (photoBorder === 'accent' && primaryColor) {
          borderClass = 'border-2';
          borderStyle.borderColor = primaryColor;
        } else if (photoBorder === 'thick') {
          borderClass = 'border-4 border-gray-300';
        } else if (photoBorder === 'shadow') {
          borderClass = 'border-0';
          shadowClass = 'shadow-lg';
        }

        return (
          <div
            className={`${shapeClass} overflow-hidden flex-shrink-0 ${borderClass} ${shadowClass}`}
            style={{ width: size, height: size, ...borderStyle }}
          >
            <img
              src={profile.photoPath!}
              alt="Photo de profil"
              className="w-full h-full object-cover"
            />
          </div>
        );
      })()}
      <div className={hasPhoto ? 'flex-1' : ''}>
        <h1 className={`cv-name ${template.preview.nameClass || 'text-3xl font-bold uppercase tracking-wider mb-1'}`}>
          {nameLineBreak === 'split'
            ? <>{profile.firstName}<br />{profile.lastName}</>
            : `${profile.firstName} ${profile.lastName}`}
        </h1>
        {title && (
          <h2 className={`cv-job-title ${template.preview.headerTitleClass || 'text-xl font-semibold text-gray-800'}`}>
            {title}
          </h2>
        )}
        {contactItems.length > 0 && (
          <div className={`cv-contact-info mt-2 ${template.preview.contactClass || 'text-sm text-gray-600'}`}>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {contactItems.map((item, idx) => (
                item.href ? (
                  <a key={idx} href={item.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center whitespace-nowrap hover:underline">
                    {item.icon}
                    {item.text}
                  </a>
                ) : (
                  <span key={idx} className="inline-flex items-center whitespace-nowrap">
                    {item.icon}
                    {item.text}
                  </span>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
