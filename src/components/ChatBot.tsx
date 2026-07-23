import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, ChefHat, Clock, Compass, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MenuItem, BusinessSettings } from '../types';
import { isRestaurantOpen, formatTime12h } from '../utils/time';

interface ChatBotProps {
  menuItems: MenuItem[];
  businessSettings: BusinessSettings;
  language: 'ar' | 'en';
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
  suggestions?: string[];
  showMapButton?: boolean;
}

export function ChatBot({ menuItems, businessSettings, language }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Monitor scroll for floating helper opacity
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 80) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Initialize with a warm human-like greeting
  useEffect(() => {
    const isAr = language === 'ar';
    const initialMsg: Message = {
      id: 'welcome',
      sender: 'bot',
      text: isAr
        ? `يامرحباً تراحيب المطر! 🌸 نورتنا في رحلة شواء. أنا مساعدك الشخصي، متواجد لخدمتك ومساعدتك في اختيار الوجبة المثالية اليوم وتوفير كل التفاصيل اللي تحتاجها لراحة بالك.\n\nتقدر تسألني عن الوجبات، الأسعار، السعرات الحرارية، أوقات العمل، التوصيل، أو حتى تطلب مني ترشيح لأفضل الأصناف على جمر الغضا! وش في خاطرك اليوم يا غالي؟`
        : `Warm welcome to Rehla BBQ! 🍖 I am your personal assistant, here to help you choose the perfect meal today and provide any details you need.\n\nFeel free to ask me about our flame-grilled items, prices, calories, working hours, delivery fees, or for our absolute best recommendations! What are you craving today?`,
      timestamp: new Date(),
      suggestions: isAr
        ? ['🔥 اقترح علي وجبة دسمة', '⏰ فاتحين الحين؟', '🥩 وش أفضل وجبة لحم؟', '📍 وين موقعكم ورقم التواصل؟']
        : ['🔥 Recommend a hearty meal', '⏰ Are you open now?', '🥩 Best meat dish?', '📍 Location & Contact']
    };
    setMessages([initialMsg]);

    // Show floating welcome notification badge after 4 seconds if not opened
    const timer = setTimeout(() => {
      if (!isOpen) {
        setShowNotification(true);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [language]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOpenChat = () => {
    setIsOpen(true);
    setShowNotification(false);
  };

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query) return;

    if (!textToSend) {
      setInputValue('');
    }

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);

    // Generate response with a tiny delayed typing effect to feel "human"
    setTimeout(() => {
      const response = generateBotResponse(query);
      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: response.text,
        timestamp: new Date(),
        suggestions: response.suggestions,
        showMapButton: response.showMapButton
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 600);
  };

  // Human-like response builder
  const generateBotResponse = (query: string): { text: string; suggestions?: string[]; showMapButton?: boolean } => {
    const q = query.toLowerCase();
    const isAr = language === 'ar';

    // 1. Helper data from settings state
    const workingHoursStr = isAr
      ? `من الساعة ${formatTime12h(businessSettings?.workingHoursStart || '17:00', 'ar')} إلى الساعة ${formatTime12h(businessSettings?.workingHoursEnd || '02:00', 'ar')}`
      : `from ${formatTime12h(businessSettings?.workingHoursStart || '17:00', 'en')} to ${formatTime12h(businessSettings?.workingHoursEnd || '02:00', 'en')}`;

    const isOpenNow = isRestaurantOpen(businessSettings?.workingHoursStart, businessSettings?.workingHoursEnd);
    const isOpenStatusText = isOpenNow
      ? (isAr ? 'نعم يا بعد حيي، فاتحين الحين ومستعدين نضبطك بأقوى وألذ طلب يوصلك حار! ✅' : 'Yes! We are currently OPEN and ready to prepare your hot meal right away! ✅')
      : (isAr ? `حالياً المطعم مغلق يا غالي خارج أوقات العمل الرسمية 💤، ويسعدنا جداً نستقبل طلبك بكل حب بأول ما نفتح خلال ساعات العمل المعتمدة: ${workingHoursStr}.` : `We are currently CLOSED 💤. We look forward to serving you during our official working hours: ${workingHoursStr}.`);

    const deliveryFee = businessSettings?.deliveryFee ?? 15;
    const deliveryText = isAr
      ? `خدمة التوصيل السريع متوفرة ومباشرة لباب بيتك بـ ${deliveryFee} ريال فقط! 🚴 وتقدر تتواصل مع مندوبك مباشرة لمعرفة مكان الطلب.`
      : `Fast delivery is available straight to your doorstep for only ${deliveryFee} SAR! 🚴 You can contact your driver directly to know the status or location of your order.`;

    // Extract dynamic items lists
    const grillsList = menuItems.filter(item => item.category === 'main' && item.isAvailable);
    const shawarmaList = menuItems.filter(item => item.category === 'shawarma' && item.isAvailable);

    const meatDishes = menuItems.filter(item => item.isAvailable && (item.nameAr.includes('لحم') || item.name.toLowerCase().includes('meat') || item.name.toLowerCase().includes('beef') || item.name.toLowerCase().includes('lamb')));
    const chickenDishes = menuItems.filter(item => item.isAvailable && (item.nameAr.includes('دجاج') || item.nameAr.includes('شيش') || item.nameAr.includes('طاووق') || item.name.toLowerCase().includes('chicken') || item.name.toLowerCase().includes('shish') || item.name.toLowerCase().includes('tawook')));

    // 2. Custom parsing logic
    // General Greeting
    if (q.match(/(هلا|مرحبا|سلام|كيفك|صباح|مساء|شلونك|أهلاً|hi|hello|hey|good morning|good evening)/)) {
      const greetingsAr = [
        `يا هلا وغلا! نورتنا وشرفتنا، عسى يومك سعيد وجميل مثلك. وش تبي ندلعك فيه اليوم من مشوياتنا الأصيلة؟ 😍`,
        `أهلاً وسهلاً بك يا غالي في رحلة شواء! يسعدنا جداً تواصلك معنا ومستعدين لأي استفسار يدور في بالك. 🔥`,
        `يا مرحباً بك! يالله حيه، نورت متجرنا المتواضع. آمر وادلل وش ودك تجرب اليوم؟ 🍖`
      ];
      const greetingsEn = [
        `Hello there! Welcome to Rehla BBQ, we are thrilled to have you here today. How can I delight you with our premium flame-grilled dishes? 😍`,
        `Warm greetings! Hope you are having a wonderful day. What delicious meal can I recommend to you today? 🍖`,
        `Hi! It's an absolute pleasure serving you. Tell me, what are you in the mood for? 🔥`
      ];
      return {
        text: isAr ? greetingsAr[Math.floor(Math.random() * greetingsAr.length)] : greetingsEn[Math.floor(Math.random() * greetingsEn.length)],
        suggestions: isAr
          ? ['🔥 اقترح علي أفضل وجبة', '⏰ ساعات العمل المعتمدة', '📍 موقع المطعم ورقم التواصل']
          : ['🔥 Suggest a top meal', '⏰ Approved Working Hours', '📍 Location & Contact Details']
      };
    }

    // Menu / Dishes / Order queries
    if (q.match(/(منيو|المنيو|قائمة|قائمة الطعام|قايمه|أصناف|اصناف|أطباق|اطباق|وجبات|وجبه|وجبة|طعام|أطلب|اطلب|طلب|طلبك|order|menu|dishes|meals|food|buy)/)) {
      const bestMeat = meatDishes.length > 0 ? meatDishes[0] : null;
      const bestChicken = chickenDishes.length > 0 ? chickenDishes[0] : null;
      
      let text = isAr 
        ? `يامرحباً بك يا غالي! 🍖 قائمة طعامنا في **رحلة شواء** ممتلئة بأشهى المشويات الطازجة والبلدية 100% والمحضرة على جمر الغضا الطبيعي، والشاورما المدخنة بطريقتنا الخاصة! \n\n`
        : `Welcome! 🍖 Our menu at **Rehla BBQ** is packed with the most delicious, 100% fresh local meats grilled over premium organic charcoal, and our signature smoked shawarma!\n\n`;

      if (bestMeat) {
        text += isAr 
          ? `🥩 **ترشيحنا للحم البلدي:** **${bestMeat.nameAr}** بسعر ${bestMeat.price} ريال فقط! (${bestMeat.calories || 580} سعرة).\n`
          : `🥩 **Our Top Meat Choice:** **${bestMeat.name}** for ${bestMeat.price} SAR! (${bestMeat.calories || 580} kcal).\n`;
      }
      if (bestChicken) {
        text += isAr
          ? `🍢 **ترشيحنا للدجاج الطازج:** **${bestChicken.nameAr}** بسعر ${bestChicken.price} ريال فقط! (${bestChicken.calories || 520} سعرة).\n`
          : `🍢 **Our Top Chicken Choice:** **${bestChicken.name}** for ${bestChicken.price} SAR! (${bestChicken.calories || 520} kcal).\n`;
      }

      text += isAr
        ? `\nتقدر تتصفح الأقسام والوجبات في متجرنا بالأعلى وتطلب الوجبة اللي تعجبك مباشرة بضغطة زر وحدة، وبنوصلها لك حارة ومقرمشة! وش ودك تستفسر عنه أكثر يا غالي؟`
        : `\nYou can easily browse our menu sections in the app above and order your favorite meal directly! What else can I help you find today?`;

      return {
        text,
        suggestions: isAr 
          ? ['🍢 تصفح المشويات', '🌯 شاورما دجاج مذهلة', '🥬 خيارات صحية ورشاقة']
          : ['🍢 Browse Grills', '🌯 Amazing Shawarma', '🥬 Healthy/Diet Options']
      };
    }

    // Working Hours queries
    if (q.match(/(وقت|ساعة|ساعات|ساعات العمل|مفتوح|مفتوحين|متى تفتح|متى تسكر|أوقات|دوام|توقيت|open|hour|time|close|schedule)/)) {
      return {
        text: isAr
          ? `ساعات عملنا الرسمية هي: **${workingHoursStr}** يومياً.\n\nحالة المطعم الآن: **${isOpenStatusText}**`
          : `Our official working hours are: **${workingHoursStr}** daily.\n\nRestaurant status now: **${isOpenStatusText}**`,
        suggestions: isAr
          ? ['🍢 وش وجبات المشويات؟', '🌯 شاورما دجاج مميزة', '🚴 هل فيه توصيل لبيتي؟']
          : ['🍢 What grills do you have?', '🌯 Smoked Shawarma', '🚴 Is delivery available?']
      };
    }

    // Recommended / Best dishes
    if (q.match(/(افضل|أفضل|أحسن|ترشح|اقترح|مميز|بطل|أكل|وجبة|recommend|suggest|best|special|favorite|delicious|popular|signature)/)) {
      // Diversify recommendations: Choose one random delicious Grill and one random delicious Shawarma
      const randomGrill = grillsList.length > 0 ? grillsList[Math.floor(Math.random() * grillsList.length)] : null;
      const randomShawarma = shawarmaList.length > 0 ? shawarmaList[Math.floor(Math.random() * shawarmaList.length)] : null;

      let recText = '';
      if (isAr) {
        recText = `أبشر بعزك يا بعد راسي! ❤️ نبي ندلعك وننوع لك اليوم بين أشهى الأكلات الأكثر طلباً ومحبة لدى عملائنا:\n\n`;
        if (randomGrill) {
          recText += `🍢 **من قسم المشويات على الجمر:** **${randomGrill.nameAr}** بسعر ${randomGrill.price} ريال فقط! ✨\n*(${randomGrill.descriptionAr || 'محضر بكل حب وطازج على الجمر'})*\n\n`;
        }
        if (randomShawarma) {
          recText += `🌯 **من قسم الشاورما المدخنة:** **${randomShawarma.nameAr}** بسعر ${randomShawarma.price} ريال فقط! ✨\n*(${randomShawarma.descriptionAr || 'شاورما مدخنة ولذيذة بطريقتنا الخاصة'})*\n\n`;
        }
        recText += `تقدر تتصفح المنيو وتطلب أي وحدة منهم بضغطة زر وتوصلك ساخنة ومنورة سفرتك! 🔥 وش حاب تستفسر عنه أكثر يا غالي؟`;
      } else {
        recText = `I have the perfect recommendations for you to try a balance of our best flavors:\n\n`;
        if (randomGrill) {
          recText += `🍢 **From Charcoal Grills:** **${randomGrill.name}** for ${randomGrill.price} SAR! ✨\n*(${randomGrill.description || 'Grilled perfectly over natural charcoal'})*\n\n`;
        }
        if (randomShawarma) {
          recText += `🌯 **From Smoked Shawarma:** **${randomShawarma.name}** for ${randomShawarma.price} SAR! ✨\n*(${randomShawarma.description || 'Our signature smoked shawarma wrap'})*\n\n`;
        }
        recText += `You can order any of these directly from the menu above! What else can I assist you with?`;
      }

      return {
        text: recText,
        suggestions: isAr
          ? ['🍢 تصفح المشويات', '🌯 تصفح الشاورما', '⏰ متى ساعات العمل؟']
          : ['🍢 Browse Grills', '🌯 Browse Shawarma', '⏰ What are your hours?']
      };
    }

    // Grills specific queries
    if (q.match(/(مشويات|مشوي|شواء|شوا|جمر|فحم|شيش|طاووق|أوصال|اوصال|كباب|grill|grills|bbq|barbecue|kabab|kebab|awsal|taouk|shish)/)) {
      if (grillsList.length === 0) {
        return {
          text: isAr
            ? `مشوياتنا المميزة محضرة بالكامل من لحوم بلدية ودواجن محلية طازجة 100% ومذبوحة يومياً تحت إشراف دقيق جداً على جمر الغضا الطبيعي لتعطيك النكهة الأصيلة! 🔥`
            : `All our premium grills are made from 100% fresh local meat and chicken, slaughtered daily and grilled to perfection over premium organic charcoal! 🔥`,
          suggestions: isAr ? ['🌯 شاورما رحلة شواء', '⏰ ساعات العمل'] : ['🌯 Smoked Shawarma', '⏰ Operating Hours']
        };
      }

      let text = isAr
        ? `يا سلام! اخترت الفخامة وأصل النكهة 🍢 مشوياتنا بلدية طازجة تحضر يومياً وتُشوى على جمر الغضا الطبيعي الساحر. إليك قائمة مشوياتنا المتاحة اليوم:\n\n`
        : `Excellent choice! 🍢 Our grills are freshly prepared daily and flame-grilled over organic charcoal for a wonderful smoky flavor. Here is our grills menu:\n\n`;

      grillsList.forEach(item => {
        text += `• **${isAr ? item.nameAr : item.name}**: ${item.price} ${isAr ? 'ريال' : 'SAR'} | ${item.calories || 450} ${isAr ? 'سعرة' : 'kcal'}\n  _${isAr ? item.descriptionAr : item.description}_\n\n`;
      });

      text += isAr ? `تقدر تضغط على أي وجبة في المنيو وتضيفها لسلتك لتجربتها ساخنة ولذيذة فوراً!` : `You can click any meal on our menu above to add it straight to your cart!`;

      return {
        text,
        suggestions: isAr ? ['🌯 طيب وش عن الشاورما؟', '🥬 أبي خيارات دايت'] : ['🌯 What about Shawarma?', '🥬 Healthy options']
      };
    }

    // Shawarma specific queries
    if (q.match(/(شاورما|شوارما|صاروخ|عربي|بوكس شاورما|صحن عربي|shawarma|sarookh|box|plate)/)) {
      if (shawarmaList.length === 0) {
        return {
          text: isAr
            ? `شاورما رحلة شواء خرافية ومحضرة يومياً من صدور الدجاج المحلية الطازجة، متبلة بخلطة شواء المدخنة الخاصة مع الثومية الغنية والبطاطس المقرمشة! 🌯`
            : `Our Shawarma is legendary! Fresh local chicken marinated in our secret blend of spices and cooked to perfection. 🌯`,
          suggestions: isAr ? ['🍢 طيب وش المشويات المتوفرة؟', '⏰ ساعات العمل'] : ['🍢 Show me the Grills', '⏰ Operating Hours']
        };
      }

      let text = isAr
        ? `أهلاً بك في عالم القرمشة واللذاذة المدخنة! 🌯 شاورما دجاج مميزة تحضر بخلطتنا السرية وتُقدم بخبز الصاج الساخن مع الثومية ومخللنا المقرمش. إليك أصناف الشاورما المتاحة اليوم:\n\n`
        : `Welcome to the world of deliciousness! 🌯 Our chicken shawarma is beautifully smoked, marinated, and served with rich garlic sauce, pickles, and crispy fries. Here is our shawarma selection:\n\n`;

      shawarmaList.forEach(item => {
        text += `• **${isAr ? item.nameAr : item.name}**: ${item.price} ${isAr ? 'ريال' : 'SAR'} | ${item.calories || 400} ${isAr ? 'سعرة' : 'kcal'}\n  _${isAr ? item.descriptionAr : item.description}_\n\n`;
      });

      text += isAr ? `اضغط على وجبة الشاورما اللي تعجبك وأضفها للسلة لنجهزها لك فوراً بكل حب!` : `Select your favorite shawarma item and add it to your cart for a delicious meal!`;

      return {
        text,
        suggestions: isAr ? ['🍢 أبي أشوف المشويات', '🚴 سعر التوصيل كم؟'] : ['🍢 Show me Grills', '🚴 What is the delivery cost?']
      };
    }

    // Meat specific queries
    if (q.match(/(لحم|لحوم|بلدي|حاشي|نعيمي|beef|lamb|meat)/)) {
      if (meatDishes.length === 0) {
        return {
          text: isAr
            ? `جميع لحومنا بلدية وطازجة 100% ومذبوحة محلياً تحت إشراف دقيق جداً لضمان أعلى مستويات الطعم والجودة! متوفرة لدينا تشكيلة مشويات فاخرة.`
            : `All our meat is 100% local, fresh, and daily slaughtered under strict quality supervision! We offer a premium variety of beef and lamb skewers.`,
          suggestions: isAr ? ['🔥 اقترح علي أفضل وجبة', '⏰ ساعات العمل'] : ['🔥 Recommend a meal', '⏰ Operating Hours']
        };
      }

      let text = isAr 
        ? `يم يم.. اخترت طعم الفخامة البلدي! 🥩 لحومنا بلدية طازجة ومحضرة يومياً على جمر الغضا الطبيعي. إليك قائمتنا الفاخرة للوجبات اللحم:\n\n`
        : `Yum! You selected the taste of luxury! 🥩 Our local meat is freshly prepared daily over natural organic charcoal. Here are our premium meat dishes:\n\n`;

      meatDishes.forEach(item => {
        text += `• **${isAr ? item.nameAr : item.name}**: ${item.price} ${isAr ? 'ريال' : 'SAR'} | ${item.calories || 420} ${isAr ? 'سعرة حرارية' : 'kcal'}\n  _${isAr ? item.descriptionAr : item.description}_\n\n`;
      });

      text += isAr ? `تقدر تضغط على الوجبة في القائمة وتضيفها لسلتك فوراً لتجربتها!` : `You can click any meal on our menu to add it straight to your cart!`;

      return {
        text,
        suggestions: isAr ? ['🥬 هل فيه خيارات دايت؟', '🚴 رسوم التوصيل'] : ['🥬 Any healthy/diet options?', '🚴 Delivery cost']
      };
    }

    // Chicken specific queries
    if (q.match(/(دجاج|chicken)/)) {
      if (chickenDishes.length === 0) {
        return {
          text: isAr
            ? `نوفر لكم دجاجاً محلياً طازجاً متبلاً بخلطة رحلة شواء السرية اللذيذة ومشوياً بكل دقة واحترافية.`
            : `We serve only fresh local chicken marinated in our secret Rehla BBQ spices, expertly grilled to perfection.`,
          suggestions: isAr ? ['🔥 اقترح علي أفضل وجبة'] : ['🔥 Recommend a meal']
        };
      }

      let text = isAr 
        ? `يا سلام! الدجاج المتبل واللذيذ المشوي بحرفية أو الشاورما المحمرة 🍢. إليك أصناف الدجاج الفاخرة المتاحة اليوم:\n\n`
        : `Excellent choice! Juicy, seasoned chicken flame-grilled to perfection 🍢. Here are our available chicken dishes:\n\n`;

      chickenDishes.forEach(item => {
        text += `• **${isAr ? item.nameAr : item.name}**: ${item.price} ${isAr ? 'ريال' : 'SAR'} | ${item.calories || 360} ${isAr ? 'سعرة حرارية' : 'kcal'}\n  _${isAr ? item.descriptionAr : item.description}_\n\n`;
      });

      return {
        text,
        suggestions: isAr ? ['🥩 طيب وش خيارات اللحم؟', '📍 وين موقعكم؟'] : ['🥩 Show me meat options', '📍 Where are you located?']
      };
    }

    // Calories / Diet / Health queries
    if (q.match(/(سعرة|سعرات|كالوري|دايت|صحي|بروتين|وزن|رجيم|خفيف|diet|calorie|calories|kcal|healthy|fit|protein|light|low carb)/)) {
      const healthyItems = menuItems.filter(item => (item.calories && item.calories < 400) || item.id.includes('salad') || item.category === 'appetizers');
      
      let text = isAr
        ? `نهتم برشاقتك وصحتك جداً! ❤️ نوفر لك السعرات الحرارية بدقة بجانب كل صنف لتختار ما يناسب نمط حياتك الرياضي أو الصحي. إليك أفضل خياراتنا الخفيفة والصحية:\n\n`
        : `We care deeply about your fitness and health! ❤️ We display exact calorie counts for every meal so you can easily track your targets. Here are our best light and healthy choices:\n\n`;

      const itemsToDisplay = healthyItems.slice(0, 4);
      itemsToDisplay.forEach(item => {
        text += `• **${isAr ? item.nameAr : item.name}**: ${item.calories || 250} ${isAr ? 'سعرة فقط!' : 'kcal only!'} | ${item.price} ${isAr ? 'ريال' : 'SAR'}\n  _${isAr ? item.descriptionAr : item.description}_\n\n`;
      });

      text += isAr
        ? `جميع وجباتنا مشوية بالكامل على الفحم العضوي بدون زيوت مهدرجة ضارة، مما يجعلها غنية بالبروتين الصافي وخياراً مثالياً لأصحاب الدايت والرياضيين.`
        : `All our main dishes are flame-grilled over organic charcoal with no hydrogenated oils, making them rich in pure protein and perfect for active lifestyles and diets.`;

      return {
        text,
        suggestions: isAr ? ['🍢 وجبات الدجاج', '🥩 وجبات اللحم'] : ['🍢 Chicken Meals', '🥩 Meat Meals']
      };
    }

    // Location / Address / Map (No phone or WhatsApp numbers requested when asking for location)
    if (q.match(/(موقع|مكان|عنوان|وين|خريطة|location|address|where|map)/)) {
      const address = isAr 
        ? (businessSettings?.addressAr || 'الرس، القصيم، المملكة العربية السعودية')
        : (businessSettings?.addressEn || 'Ar Rass, Al Qassim, Saudi Arabia');

      return {
        text: isAr
          ? `📍 **الموقع:** ${address}\n\n` +
            `اضغط على الزر الأخضر بالأسفل للذهاب مباشرة إلى خرائط جوجل ماب! 👇`
          : `📍 **Address:** ${address}\n\n` +
            `Click the green button below to open Google Maps directly and navigate easily! 👇`,
        suggestions: isAr ? ['⏰ متى أوقات دوامكم؟', '🔥 وش أفضل وجبة؟'] : ['⏰ What are your hours?', '🔥 Recommend a meal'],
        showMapButton: true
      };
    }

    // Contact details / Social
    if (q.match(/(رقم|تواصل|هاتف|جوال|واتساب|تلفون|phone|contact|number|whatsapp)/)) {
      const phoneNum = businessSettings?.phone || '0501234567';
      const waNum = businessSettings?.whatsappNumber || '966501234567';
      return {
        text: isAr
          ? `يا هلا! يسعدنا تواصلك معنا مباشرة عبر القنوات التالية:\n\n` +
            `📞 **رقم الاتصال:** [${phoneNum}](tel:${phoneNum})\n` +
            `💬 **رقم الواتساب المباشر:** [اضغط هنا للمراسلة](https://wa.me/${waNum.replace(/\D/g, '')})`
          : `We'd love to connect with you! Here is our contact information:\n\n` +
            `📞 **Call Us:** [${phoneNum}](tel:${phoneNum})\n` +
            `💬 **Direct WhatsApp:** [Click here to chat](https://wa.me/${waNum.replace(/\D/g, '')})`,
        suggestions: isAr ? ['📍 موقع المطعم', '⏰ متى أوقات دوامكم؟'] : ['📍 Restaurant Location', '⏰ What are your hours?']
      };
    }

    // Delivery queries
    if (q.match(/(توصيل|رسوم|مندوب|سائق|شحن|سعر التوصيل|delivery|shipping|driver|fee|cost)/)) {
      return {
        text: deliveryText,
        suggestions: isAr ? ['⏰ المطعم فاتح الحين؟', '📍 وين موقعكم؟'] : ['⏰ Are you open now?', '📍 Where are you located?']
      };
    }

    // Payment methods queries
    if (q.match(/(دفع|كاش|تحويل|مدى|فيزا|حساب|بطاقة|راجحي|payment|pay|cash|card|bank|transfer|mada|apple|applepay)/)) {
      const paymentEnabled = businessSettings?.onlinePaymentEnabled ?? true;
      let text = '';
      if (isAr) {
        text = `نوفر لك طرق دفع مرنة وآمنة تناسب راحتك تماماً:\n\n` +
          `💵 **الدفع عند الاستلام (كاش):** متوفر لجميع طلبات التوصيل أو الاستلام.\n` +
          `🏦 **التحويل البنكي المباشر:** عبر حساب ${businessSettings?.bankNameAr || 'مصرف الراجحي'} مع إمكانية رفع إيصال التحويل لسرعة التأكيد.\n`;

        if (paymentEnabled) {
          text += `💳 **الدفع الإلكتروني (مدى / آبل باي):** متوفر الآن ومفعل عبر بوابتنا الآمنة لتجربة دفع فورية ومريحة جداً!`;
        } else {
          text += `💳 **الدفع الإلكتروني (مدى / آبل باي):** [قريباً لراحتكم ⏳] نعمل حالياً على صيانة بوابة الدفع لترقيتها، وستعود للعمل قريباً جداً لخدمتكم بشكل أفضل!`;
        }
      } else {
        text = `We offer flexible and secure payment options for your absolute convenience:\n\n` +
          `💵 **Cash on Delivery (COD):** Available for all delivery & pickup orders.\n` +
          `🏦 **Bank Transfer:** Direct transfer to our ${businessSettings?.bankNameEn || 'Al Rajhi Bank'} account.\n`;

        if (paymentEnabled) {
          text += `💳 **Online Payment (Mada / Apple Pay):** Fully active and integrated via our secure gateway for immediate checkout!`;
        } else {
          text += `💳 **Online Payment (Mada / Apple Pay):** [Coming Soon ⏳] We are currently performing routine maintenance on our online payment gateway to serve you better soon.`;
        }
      }

      return {
        text,
        suggestions: isAr ? ['🥩 اقترح وجبة لحم بلدي', '🚴 رسوم التوصيل'] : ['🥩 Suggest a premium meat dish', '🚴 Delivery cost']
      };
    }

    // Fallback response for unhandled queries (conversational, courteous)
    const fallbacksAr = [
      `تسلم يا غالي على هالسؤال! ❤️ بخصوص هذا الاستفسار، الوجبات لدينا دايماً طازجة وبأعلى جودة. تقدر تتصفح المنيو مباشرة في الأعلى أو تسألني عن أي وجبة مثل الكباب أو أوصال اللحم لمساعدتك حالاً!`,
      `يا غالي، سؤالك على راسي! لتسهيل الأمر عليك، تقدر تسألني عن الوجبات المتوفرة، السعرات الحرارية، أوقات الدوام، أو موقع المطعم وبجاوبك بثانية واحدة. وش ودك اعرف أكثر؟ 😍`,
      `أنا هنا لمساعدتك دائماً! ياليت توضح لي طلبك أكثر يا غالي (مثلاً: وش أفضل وجبة؟ كم سعر التوصيل؟ أوقات العمل) وأنا بخدمتك فوراً وبأجمل إجابة مختبرة ومختصرة! 🍖`
    ];
    const fallbacksEn = [
      `Thank you for reaching out! ❤️ To serve you best, please ask me about our available menu items, calorie counts, working hours, delivery options, or address. I am ready to help you choose the best meal!`,
      `That's a great question! Feel free to ask about our premium charcoal grilled meats, chicken kebab, prices, or operating hours. What would you like to explore next? 😍`,
      `I am always at your service! Please specify your query (e.g., "Recommend a meal", "What is the delivery fee?", "Are you open?") so I can assist you with precise, concise answers! 🍖`
    ];

    return {
      text: isAr ? fallbacksAr[Math.floor(Math.random() * fallbacksAr.length)] : fallbacksEn[Math.floor(Math.random() * fallbacksEn.length)],
      suggestions: isAr
        ? ['🔥 اقترح علي أفضل وجبة', '⏰ ساعات العمل المعتمدة', '📍 موقع المطعم ورقم التواصل']
        : ['🔥 Suggest a top meal', '⏰ Approved Working Hours', '📍 Location & Contact Details']
    };
  };

  return (
    <>
      {/* Floating Chat Button Toggle */}
      <div className={`fixed bottom-6 ${language === 'ar' ? 'left-6' : 'right-6'} z-[999] flex flex-col items-end gap-2 transition-all duration-300 ${
        isScrolled && !isOpen ? 'opacity-30 hover:opacity-100' : 'opacity-100'
      }`}>
        {/* Floating Notification Promo Badge */}
        <AnimatePresence>
          {showNotification && !isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 15 }}
              onClick={handleOpenChat}
              className="bg-neutral-900 border border-white/10 text-white rounded-2xl p-3 shadow-xl max-w-xs text-start cursor-pointer hover:bg-neutral-800 transition-all font-sans relative"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotification(false);
                }}
                className="absolute top-1 right-1 p-0.5 rounded-full text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex gap-2.5 items-center">
                <div className="p-2 bg-yellow rounded-xl text-black shrink-0">
                  <ChefHat className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h5 className="text-[11px] font-black text-yellow leading-tight">
                    {language === 'ar' ? 'مساعد رحلة شواء' : 'Rehla BBQ Assistant'}
                  </h5>
                  <p className="text-[10px] text-white/80 mt-0.5 leading-snug font-medium">
                    {language === 'ar' 
                      ? 'مرحباً يا غالي! آمرني وش في خاطرك مشويات اليوم؟ 🍖' 
                      : 'Hi! Let me help you select the best hot meals today! 🍖'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The Core Floating Circular Button */}
        <button
          id="rehla-chatbot-toggle"
          type="button"
          onClick={() => {
            if (isOpen) setIsOpen(false);
            else handleOpenChat();
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center text-black font-black shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer border-2 border-white/20 relative ${
            isOpen ? 'bg-rose-500 text-white' : 'bg-yellow'
          }`}
        >
          {isOpen ? (
            <X className="w-6 h-6 animate-none" />
          ) : (
            <>
              <MessageCircle className="w-6 h-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 rounded-full border border-white animate-ping" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 rounded-full border border-white" />
            </>
          )}
        </button>
      </div>

      {/* Floating Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="rehla-chatbot-panel"
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            className={`fixed bottom-24 ${
              language === 'ar' ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
            } w-[calc(100vw-2rem)] sm:w-96 h-[500px] bg-white border border-slate-200 shadow-2xl rounded-[2rem] z-[1000] overflow-hidden flex flex-col font-sans`}
          >
            {/* Header banner */}
            <div className="bg-gradient-to-br from-neutral-900 to-amber-950 p-4 text-white flex justify-between items-center shrink-0 border-b border-white/5 relative">
              <div className="absolute top-0 right-0 left-0 bottom-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.15),transparent_60%)] pointer-events-none" />
              <div className="flex items-center gap-3 z-10 text-start">
                <div className="w-10 h-10 rounded-2xl bg-yellow/10 border border-yellow/20 flex items-center justify-center text-yellow font-black shrink-0 shadow-sm">
                  <ChefHat className="w-5 h-5 text-yellow" />
                </div>
                <div>
                  <h4 className="text-sm font-black tracking-wide text-white">
                    {language === 'ar' ? 'مساعد رحلة شواء' : 'Rehla BBQ Assistant'}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-400">
                      {language === 'ar' ? 'متصل وجاهز لخدمتك حالاً' : 'Online & ready to serve'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-all cursor-pointer z-10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat message streams area */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed text-start ${
                    msg.sender === 'user'
                      ? 'bg-amber-500 text-white font-semibold rounded-br-none shadow-sm'
                      : 'bg-white border border-slate-100 text-slate-800 font-medium rounded-bl-none shadow-xs whitespace-pre-wrap'
                  }`}>
                    <div>{msg.text}</div>

                    {msg.sender === 'bot' && msg.showMapButton && (
                      <a
                        href="https://maps.app.goo.gl/uisk1zC7yBg29dmL8"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-750 text-white font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all text-xs"
                      >
                        <Compass className="w-4 h-4 animate-pulse" />
                        {language === 'ar' ? '📍 فتح خرائط جوجل ماب مباشرة' : '📍 Open Google Maps Directly'}
                      </a>
                    )}
                    
                    {/* Timestamp display */}
                    <span className={`block text-[8px] mt-1.5 font-mono ${
                      msg.sender === 'user' ? 'text-white/60 text-right' : 'text-slate-400 text-left'
                    }`}>
                      {msg.timestamp.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>

                    {/* Bot suggested chip clicks */}
                    {msg.sender === 'bot' && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-slate-100">
                        {msg.suggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMessage(suggestion)}
                            className="bg-slate-50 hover:bg-yellow/10 border border-slate-200 hover:border-yellow text-[10px] text-slate-600 hover:text-yellow-900 font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input message form controls */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3 bg-white border-t border-slate-100 flex gap-2 items-center shrink-0"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={language === 'ar' ? 'اكتب استفسارك هنا يا غالي...' : 'Write your question here...'}
                className="flex-1 bg-slate-50 text-xs text-slate-850 p-2.5 rounded-xl border border-slate-200 outline-none focus:border-amber-500 font-medium text-start"
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
              >
                <Send className={`w-4 h-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
