interface InAppBrowserResult {
  isInApp: boolean;
  platform: string | null;
}

export function detectInAppBrowser(): InAppBrowserResult {
  if (typeof navigator === "undefined") {
    return { isInApp: false, platform: null };
  }

  const ua = navigator.userAgent;

  if (/LinkedInApp/i.test(ua)) {
    return { isInApp: true, platform: "LinkedIn" };
  }
  if (/FBAN|FBAV/i.test(ua)) {
    return { isInApp: true, platform: "Facebook" };
  }
  if (/Instagram/i.test(ua)) {
    return { isInApp: true, platform: "Instagram" };
  }
  if (/Twitter/i.test(ua)) {
    return { isInApp: true, platform: "X (Twitter)" };
  }
  // Generic Android WebView detection
  if (/; wv\)/.test(ua)) {
    return { isInApp: true, platform: null };
  }

  return { isInApp: false, platform: null };
}
