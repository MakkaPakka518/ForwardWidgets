// ==========================================
// 豆瓣同步 Pro (稳健版 v3.0)
// ==========================================

WidgetMetadata = {
  id: "douban_sync_stable",
  title: "豆瓣同步 & 智能排序",
  author: "Gemini",
  description: "修复数据缺失问题。支持按【更新时间】排序，内置防崩溃机制。",
  // 核心入口
  modules: [
    {
      title: "豆瓣片单",
      requiresWebView: false,
      functionName: "mainLoader",
      type: "list", 
      cacheDuration: 3600,
      params: [
        {
          name: "user_id",
          title: "豆瓣 ID (必填)",
          type: "input",
          description: "数字ID (例: 1234567) 或 域名ID",
        },
        {
          name: "status",
          title: "筛选状态",
          type: "enumeration",
          defaultValue: "mark",
          enumOptions: [
            { title: "想看 (Mark)", value: "mark" },
            { title: "在看 (Doing)", value: "doing" },
            { title: "看过 (Done)", value: "done" }
          ],
        },
        {
          name: "sort_mode",
          title: "高级排序",
          type: "enumeration",
          defaultValue: "default",
          enumOptions: [
            { title: "📌 默认 (豆瓣原序)", value: "default" },
            { title: "📅 按剧集更新 (追更)", value: "update" },
            { title: "🎬 按上映年份", value: "release" }
          ]
        },
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    }
  ],
};

// ==========================================
// 1. 常量定义
// ==========================================

const HEADERS = {
  "Referer": "https://m.douban.com/movie",
  // 使用更通用的手机 User-Agent
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
};

// ==========================================
// 2. 主程序 (入口)
// ==========================================

async function mainLoader(params) {
  // 全局 Try-Catch，防止抛出异常导致 App 显示“数据缺失”
  try {
    const { user_id, status = "mark", sort_mode = "default", page = 1 } = params;

    if (!user_id) {
      return [createMsgCard("配置错误", "请在组件编辑页填写豆瓣ID")];
    }

    // --- A. 获取豆瓣原始数据 ---
    const doubanItems = await fetchDoubanData(user_id, status, page);
    
    // 如果获取失败（返回了错误对象），直接展示错误
    if (doubanItems.length > 0 && doubanItems[0].isError) {
        return [createMsgCard(doubanItems[0].title, doubanItems[0].subTitle)];
    }
    
    if (doubanItems.length === 0) {
        return [createMsgCard("列表为空", "没有更多数据了")];
    }

    // --- B. 如果不需要高级排序，直接返回 ---
    if (sort_mode === "default") {
        return doubanItems.map(item => buildFinalCard(item));
    }

    // --- C. 高级排序 (TMDB 数据注入) ---
    // 并发请求，但限制单次错误不影响整体
    const enrichedItems = await Promise.all(
        doubanItems.map(item => processItemWithTMDB(item, sort_mode))
    );

    // --- D. 执行排序逻辑 ---
    if (sort_mode === "update") {
        // 按 sortDate 倒序 (新 -> 旧)
        enrichedItems.sort((a, b) => {
             if (a.sortDate === b.sortDate) return 0;
             return a.sortDate < b.sortDate ? 1 : -1;
        });
    } else if (sort_mode === "release") {
         enrichedItems.sort((a, b) => {
             if (a.sortDate === b.sortDate) return 0;
             return a.sortDate < b.sortDate ? 1 : -1;
        });
    }

    // --- E. 渲染 ---
    return enrichedItems.map(item => buildFinalCard(item, sort_mode));

  } catch (globalErr) {
    // 最后的安全网
    console.error(globalErr);
    return [createMsgCard("系统崩溃", globalErr.message)];
  }
}

// ==========================================
// 3. 功能函数模块
// ==========================================

// 获取豆瓣数据
async function fetchDoubanData(userId, status, page) {
    const count = 15;
    const start = (page - 1) * count;
    // 关键参数：ck= (即使为空) 和 for_mobile=1
    const url = `https://m.douban.com/rexxar/api/v2/user/${userId}/interests?type=${status}&count=${count}&order_by=time&start=${start}&ck=&for_mobile=1`;
    
    try {
        const res = await Widget.http.get(url, { headers: HEADERS });
        
        // 兼容性处理：有些环境 res.body 是 string，有些是 object
        let data = res.data || res.body;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch(e) { return [{isError:true, title:"解析失败", subTitle:"豆瓣返回了非JSON数据"}]; }
        }

        if (data.msg === "user_not_found") return [{isError:true, title:"ID错误", subTitle:"找不到该用户"}];
        if (!data.interests) return []; // 空列表

        // 格式化基础数据
        return data.interests.map(i => {
            const subject = i.subject || {};
            const isMovie = subject.type === "movie";
            return {
                doubanId: subject.id,
                title: subject.title,
                original_title: subject.original_title,
                year: subject.year,
                // 封面容错
                pic: subject.pic?.large || subject.pic?.normal || subject.cover_url || "",
                rating: subject.rating?.value || "",
                type: isMovie ? "movie" : "tv",
                comment: i.comment,
                create_time: i.create_time,
                // 默认排序时间 (设为极小值，保证如果没查到数据排在最后)
                sortDate: "1900-01-01",
                extraInfo: ""
            };
        });

    } catch (e) {
        return [{isError:true, title:"网络错误", subTitle: e.message}];
    }
}

// 使用 TMDB 补充数据 (绝不抛出异常，失败就返回原对象)
async function processItemWithTMDB(item, sortMode) {
    try {
        // 1. 搜索
        // Forward 内置 Widget.tmdb.search
        const searchRes = await Widget.tmdb.search(item.title, item.type, { language: "zh-CN" });
        const results = searchRes.results || [];
        
        let match = null;
        if (results.length > 0) {
            // 简单年份匹配，增加准确率
            const targetYear = parseInt(item.year);
            match = results.find(r => {
                const rDate = r.first_air_date || r.release_date || "1900";
                const rYear = parseInt(rDate.substring(0, 4));
                return Math.abs(rYear - targetYear) <= 2;
            });
            if (!match) match = results[0];
        }

        if (match) {
            item.tmdbId = match.id; // 绑定 TMDB ID

            if (item.type === "tv" && sortMode === "update") {
                // 如果是剧集且需要按更新时间，查详情
                try {
                    const detail = await Widget.tmdb.get(`/tv/${match.id}`, { params: { language: "zh-CN" } });
                    const next = detail.next_episode_to_air;
                    const last = detail.last_episode_to_air;

                    if (next) {
                        item.sortDate = next.air_date;
                        item.extraInfo = `🔜 下集 ${formatDate(next.air_date)}`;
                    } else if (last) {
                        item.sortDate = last.air_date;
                        item.extraInfo = `🔥 更新 ${formatDate(last.air_date)}`;
                    } else {
                        item.sortDate = detail.first_air_date || "1900-01-01";
                        item.extraInfo = "📅 " + item.sortDate;
                    }
                } catch(e) {
                    // 详情获取失败，回退
                    item.sortDate = match.first_air_date || "1900-01-01";
                }
            } else {
                // 电影或普通模式
                item.sortDate = match.release_date || match.first_air_date || "1900-01-01";
                item.extraInfo = `📅 ${item.sortDate}`;
            }
        }
    } catch (e) {
        console.log(`[TMDB Fail] ${item.title}: ${e.message}`);
        // 失败了不处理，保持原样返回
    }
    return item;
}

// 构建卡片
function buildFinalCard(item, sortMode) {
    let sub = "";
    let genre = "";

    // 确定副标题显示什么
    if (sortMode && sortMode !== "default" && item.extraInfo) {
        sub = item.extraInfo;
        genre = item.rating ? `⭐${item.rating}` : item.year;
    } else {
        // 默认显示逻辑
        sub = item.comment ? `💬 ${item.comment}` : (item.original_title || "");
        genre = item.rating ? `豆瓣 ${item.rating}` : item.year;
    }

    return {
        // 必须字段：id, type
        id: String(item.doubanId),
        // 这里的 type 决定点击行为：
        // 如果有 tmdbId，type="tmdb" 会调用 App 原生详情页
        // 否则 type="douban" 或 "web" 跳网页
        type: item.tmdbId ? "tmdb" : "web",
        tmdbId: item.tmdbId || null, 
        
        title: item.title,
        subTitle: sub,
        genreTitle: String(genre), // 确保是字符串
        
        posterPath: item.pic,
        description: item.original_title || "",
        
        // Web 跳转链接
        url: `https://m.douban.com/${item.type}/${item.doubanId}/`
    };
}

// 辅助：生成一个纯文本的错误提示卡片
function createMsgCard(title, subTitle) {
    return {
        id: "error_card",
        type: "text", // 纯文本类型
        title: title,
        subTitle: subTitle
    };
}

// 辅助：日期格式化
function formatDate(str) {
    if (!str) return "";
    return str.substring(5); // 2024-05-20 -> 05-20
}
