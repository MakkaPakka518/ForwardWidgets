WidgetMetadata = {
  id: "gemini.platform.originals.pro",
  title: "流媒体·独家原创",
  author: "Gemini",
  description: "查看 Netflix/HBO/腾讯/B站 等平台的【自制/独占】内容",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. API Key
        {
          name: "apiKey",
          title: "TMDB API Key (必填)",
          type: "input",
          description: "必须填写",
        },
        // 2. 平台选择 (Network)
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213", // Netflix
          enumOptions: [
            // --- 国际巨头 ---
            { title: "Netflix (网飞原创)", value: "213" },
            { title: "HBO (黄暴神剧)", value: "49" },
            { title: "Apple TV+ (苹果自制)", value: "2552" },
            { title: "Disney+ (漫威/星战)", value: "2739" },
            { title: "Amazon (黑袍纠察队)", value: "1024" },
            { title: "AMC (绝命毒师)", value: "174" },
            // --- 国内巨头 (TMDB数据源) ---
            { title: "腾讯视频 (Tencent)", value: "2007" },
            { title: "爱奇艺 (iQIYI)", value: "1330" },
            { title: "优酷 (Youku)", value: "1419" },
            { title: "芒果TV (Mango)", value: "1631" },
            { title: "Bilibili (B站出品)", value: "3359" } // B站 Network ID
          ]
        },
        // 3. 类型筛选 (Genre)
        {
          name: "genre",
          title: "叠加类型",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部 (All)", value: "" },
            { title: "剧情 (Drama)", value: "18" },
            { title: "科幻/奇幻 (Sci-Fi)", value: "10765" },
            { title: "动画/动漫 (Animation)", value: "16" },
            { title: "喜剧 (Comedy)", value: "35" },
            { title: "动作/冒险 (Action)", value: "10759" },
            { title: "犯罪 (Crime)", value: "80" },
            { title: "纪录片 (Docu)", value: "99" }
          ]
        },
        // 4. 排序
        {
          name: "sortBy",
          title: "排序方式",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 近期热度", value: "popularity.desc" },
            { title: "⭐ 历史评分", value: "vote_average.desc" },
            { title: "📅 最新首播", value: "first_air_date.desc" }
          ]
        }
      ]
    }
  ]
};

async function loadPlatformOriginals(params = {}) {
  const apiKey = params.apiKey;
  if (!apiKey) {
    return [{ id: "err", title: "❌ 请填写 API Key", type: "text" }];
  }

  const networkId = params.network || "213";
  const genreId = params.genre || "";
  const sortBy = params.sortBy || "popularity.desc";

  // 1. 构建 URL
  // 使用 discover/tv 接口，配合 with_networks
  let url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&include_adult=false&include_null_first_air_dates=false&page=1`;
  
  // 核心参数：出品方
  url += `&with_networks=${networkId}`;
  
  // 叠加参数：类型
  if (genreId) {
      url += `&with_genres=${genreId}`;
  }
  
  // 叠加参数：排序
  url += `&sort_by=${sortBy}`;
  
  // 优化：如果是按评分排序，必须加一个门槛，防止只有1个人评分的冷门片排第一
  if (sortBy.includes("vote_average")) {
      url += `&vote_count.gte=200`;
  }

  console.log(`[Originals] Network: ${networkId}, Genre: ${genreId}`);

  try {
    const res = await Widget.http.get(url);
    const data = res.data || res;

    if (!data.results || data.results.length === 0) {
      return [{ 
          id: "empty", 
          title: "🔍 该分类下无数据", 
          subTitle: "尝试切换类型或平台", 
          type: "text" 
      }];
    }

    // 2. 格式化输出
    return data.results.map(item => {
        return {
            id: String(item.id),
            tmdbId: parseInt(item.id),
            type: "tmdb",
            mediaType: "tv", // 此接口主要针对剧集/动画
            
            title: item.name || item.original_name,
            subTitle: item.original_name !== item.name ? item.original_name : "",
            
            posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
            backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
            
            rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
            year: (item.first_air_date || "").substring(0, 4),
            
            description: item.overview || "暂无简介"
        };
    });

  } catch (e) {
    return [{ id: "err_net", title: "网络错误", subTitle: e.message, type: "text" }];
  }
}
