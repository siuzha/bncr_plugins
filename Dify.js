/**
 * @author siuzha
 * @name Dify
 * @team siuzha
 * @version 1.0.0
 * @description Dify聊天插件
 * @rule ^ai\s
 * @admin false
 * @public true
 * @priority 1000
 * @disable false
 * @classification ["ai聊天"]
 */

const axios = require('axios');
const sysdb = new BncrDB('dify');

// 配置Schema定义
// 按指定格式重构的配置Schema
const configSchema = BncrCreateSchema.object({
  enable: BncrCreateSchema.boolean().setTitle('是否开启Dify').setDescription(`设置false则不启用`).setDefault(false),
  apiKey: BncrCreateSchema.string().setTitle('API密钥').setDescription('从Dify平台获取的API访问密钥').setDefault(''),
  apiBase: BncrCreateSchema.string().setTitle('API地址').setDescription('Dify服务基础地址（默认官方服务）').setDefault('https://api.dify.ai/v1')
});

// 初始化配置管理器
const DifyConfig = new BncrPluginConfig(configSchema);

module.exports = async (sender) => {
  await DifyConfig.get();
  
  try {
    // ===== 官方推荐消息获取方式 =====
    const rawMessage = await sender.getMsg();
    const rawUserId = await sender.getUserId();
    // const rawUserName = await sender.getUserName();

    // console.log('🔍 用户ID：', rawUserId);
    // console.log('🔍 用户NAME：', rawUserName);


    // ===== 命令格式验证 =====
    if (!rawMessage.match(/^ai\s+/i)) {
      return await sender.reply('⚠️ 命令格式错误，正确格式：ai [内容]');
    }

    // ===== 内容处理 =====
    const processedMessage = rawMessage.replace(/^ai\s+/i, '').trim();
    if (!processedMessage) {
      return await sender.reply('💡 使用方法：ai [你的提问]');
    }

    if (!DifyConfig.userConfig.apiKey) {
      return await sender.reply('⚠️ 尚未配置Dify API密钥');
    }

    // ===== 调用Dify API =====
    const apiUrl = `${DifyConfig.userConfig.apiBase}/chat-messages`;
    
    // 从数据库获取会话ID
    let conversation_id = await sysdb.get(rawUserId);
    
    const requestBody = {
      inputs: {},
      query: processedMessage,
      response_mode: "blocking",//blocking,streaming
      conversation_id: conversation_id || "",
      user: `bncr-${rawUserId}`,
    };
    
    const requestHeaders =  {
          'Authorization': `Bearer ${DifyConfig.userConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      
    // 打印调试信息
    console.log('✅ 完整URL:', apiUrl);
    console.log('✅ 请求头:', requestHeaders);
    console.log('✅ 请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(apiUrl, requestBody, { headers: requestHeaders });
    // 检查响应结构
    if (!response.data?.answer) {
      throw new Error(`API 响应异常，未找到answer字段: ${JSON.stringify(response.data)}`);
    }

    // ===== 返回结果 =====
    const replyContent = response.data.answer;
    const conversationId = response.data.conversation_id;
    
    // 存储会话ID到数据库
    await sysdb.set(rawUserId, conversationId);
    
    await sender.reply(`🤖 Dify回复：\n${replyContent.replace(/^/gm, '  ')}`);

  } catch (error) {
    // ===== 统一错误处理 =====
    console.error('API 错误:', error.response?.data || error.message);

    // 增加会话重置逻辑（可选）
    if (error.response?.data?.error?.code === 'CONVERSATION_NOT_FOUND') {
      delete userConversations[rawUserId]; // 清除无效会话
      await sender.reply('⚠️ 会话已过期，已为您创建新会话');
    }

    const errorMap = {
      '命令格式错误': '格式错误：请使用"ai [内容]"格式',
      'Dify聊天插件当前已禁用': '功能禁用：请在配置中启用插件',
      '尚未配置Dify API密钥': '配置错误：缺少API密钥'
    };

    const errorMsg = errorMap[error.message] || `处理失败：${error.message}`;
    await sender.reply(`❌ ${errorMsg}`);
  }
};
