WidgetMetadata = {
    id: "missav_fix_final",
    title: "MissAV (强力修复版)",
    author: "MakkaPakka",
    description: "针对 Cloudflare 反爬优化，支持 m3u8 直连解析。",
    version: "1.1.0",
    requiredVersion: "0.0.1",
    site: "https://missav.com",

    modules: [
        {
            title: "浏览视频",
            functionName: "loadList",
            type: "video",
            params: [
                { name: "page", title: "页码", type: "page" },
                { 
                    name: "category", 
                    title: "分类", 
                    type: "enumeration", 
                    value: "new",
                    enumOptions: [
                        { title: "🆕 最新发布", value: "new" },
                        { title: "🔥 发行商热门", value: "dm" }, // 很多热门内容在这里
                        { title: "🔞 无码流出", value: "uncensored-leak" },
                        { title: "🇯🇵 东京热", value: "tokyo-hot" },
                        { title: "🇨🇳 中文字幕", value: "chinese-subtitle" }
                    ] 
                }
            ]
        }
    ]
};

const BASE_URL = "https://missav.com";
// 使用更真实的 iPhone UA
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

async function loadList(params = {}) {
    const { page = 1, category = "new" } = params;
    
    // 构造 URL
    let url = `${BASE_URL}/${category}`;
    if (page > 1) {
        url += `?page=${page}`;
    }

    console.log(`[MissAV] Fetching: ${url}`);

    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "User-Agent": UA,
                "Referer": BASE_URL + "/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        });
        
        const html = res.data;
        // 简单检查是否被 CF 拦截 (如果 HTML 包含 "Just a moment" 或 "Cloudflare")
        if (!html || html.includes("Cloudflare") || html.includes("Just a moment")) {
            return [{ id: "err_cf", type: "text", title: "被 Cloudflare 拦截", subTitle: "请稍后重试或切换网络" }];
        }

        const $ = Widget.html.load(html);
        const results = [];

        // 适配 MissAV 的 Grid 布局
        // 查找所有包含封面的容器
        $("div.group").each((i, el) => {
            const $el = $(el);
            const $link = $el.find("a.text-secondary");
            
            // 尝试获取链接，MissAV 有时链接在图片上
            const href = $link.attr("href") || $el.find("a").attr("href");
            
            if (href) {
                const title = $link.text().trim() || $el.find("img").attr("alt");
                const $img = $el.find("img");
                // 优先获取 data-src (懒加载)，其次 src
                const img = $img.attr("data-src") || $img.attr("src");
                const duration = $el.find(".absolute.bottom-1.right-1").text().trim();

                if (title && img) {
                    results.push({
                        id: href,
                        type: "link", // 点击触发 loadDetail
                        title: title,
                        coverUrl: img,
                        link: href,
                        description: duration,
                        customHeaders: {
                            "Referer": BASE_URL,
                            "User-Agent": UA
                        }
                    });
                }
            }
        });

        if (results.length === 0) {
            return [{ id: "empty", type: "text", title: "解析为空", subTitle: "网站结构可能已变更" }];
        }

        return results;
    } catch (e) {
        return [{ id: "err", type: "text", title: "加载失败", subTitle: e.message }];
    }
}

async function loadDetail(link) {
    try {
        const res = await Widget.http.get(link, {
            headers: { 
                "User-Agent": UA,
                "Referer": BASE_URL // 必须带 Referer
            }
        });
        const html = res.data;

        // --- 核心：暴力提取 m3u8 ---
        let m3u8Url = "";

        // 1. 尝试匹配 playlist.m3u8 这种标准格式
        // MissAV 的 m3u8 通常包含在 script 标签的 source 变量里，或者直接是 https url
        // 正则解释：匹配 https 开头，中间不含引号，以 .m3u8 结尾，可能后面带参数
        const regex = /['"](https:\/\/[^'"]+?\.m3u8[^'"]*)['"]/;
        const match = html.match(regex);
        
        if (match && match[1]) {
            m3u8Url = match[1];
        } else {
            // 2. 尝试匹配 source = '...' 格式
            const match2 = html.match(/source\s*=\s*['"]([^'"]+)['"]/);
            if (match2 && match2[1] && match2[1].includes("m3u8")) {
                m3u8Url = match2[1];
            }
        }

        // 解析失败
        if (!m3u8Url) {
            return [{ id: "err_parse", type: "text", title: "无法解析视频地址", subTitle: "可能需要登录或使用了非 m3u8 播放器" }];
        }

        // 提取标题
        const $ = Widget.html.load(html);
        const title = $("h1").text().trim() || "MissAV Video";

        return [{
            id: link,
            type: "video",
            title: title,
            videoUrl: m3u8Url,
            playerType: "system",
            // 关键：播放时必须带 Referer，否则 403
            customHeaders: {
                "Referer": link, // 指向详情页 URL
                "User-Agent": UA,
                "Origin": BASE_URL
            }
        }];

    } catch (e) {
        return [{ id: "err", type: "text", title: "详情页请求错误", subTitle: e.message }];
    }
}
