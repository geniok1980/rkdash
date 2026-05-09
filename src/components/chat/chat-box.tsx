'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig
} from '@/components/ui/chart';

interface ChartData {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  data: any[];
  config: {
    xKey: string;
    yKey: string;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  charts?: ChartData[];
}

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)'
];

export function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const threadIdRef = useRef(`session-${Math.random().toString(36).substring(7)}`);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Автоматический скролл вниз при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [messages, isLoading]);

  useEffect(() => {
    fetch('/api/ping')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setServerStatus('online');
        else setServerStatus('offline');
      })
      .catch(() => setServerStatus('offline'));
  }, []);

  const parseMessage = (text: string) => {
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    const charts: ChartData[] = [];
    let cleanText = text;

    while ((match = jsonRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.type === 'chart') {
          charts.push(parsed);
          cleanText = cleanText.replace(match[0], '');
        }
      } catch (e) {
        console.error('Failed to parse chart JSON', e);
      }
    }

    return { cleanText: cleanText.trim(), charts };
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          threadId: threadIdRef.current
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${response.status}`);
      }

      const data = await response.json();
      if (data.text) {
        const { cleanText, charts } = parseMessage(data.text);
        setMessages((prev) => [...prev, { role: 'assistant', content: cleanText, charts }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Сервер прислал пустой ответ.' }
        ]);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      let errorMsg = 'Не удалось подключиться к серверу.';
      if (error.name === 'AbortError')
        errorMsg = 'Ошибка: Время ожидания ответа истекло (300 сек).';
      else if (error.message) errorMsg = `Ошибка: ${error.message}`;

      setMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderChart = (chart: ChartData, index: number) => {
    const { chartType, data, config, title } = chart;

    // Создаем конфиг для Shadcn UI Chart
    const chartConfig: ChartConfig = {
      value: {
        label: title,
        color: 'var(--chart-1)'
      }
    };

    return (
      <div key={index} className='mt-4 p-4 bg-background border rounded-lg w-full overflow-hidden'>
        <h4 className='text-sm font-semibold mb-4 text-center'>{title}</h4>
        <ChartContainer config={chartConfig} className='aspect-auto h-[300px] w-full'>
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' />
              <XAxis dataKey={config.xKey} tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey={config.yKey} fill='var(--chart-1)' radius={4} />
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid vertical={false} strokeDasharray='3 3' />
              <XAxis dataKey={config.xKey} tickLine={false} tickMargin={10} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type='monotone'
                dataKey={config.yKey}
                stroke='var(--chart-1)'
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey={config.yKey}
                nameKey={config.xKey}
                innerRadius={60}
                strokeWidth={5}
              >
                {data.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ChartContainer>
      </div>
    );
  };

  return (
    <Card className='w-full max-w-4xl mx-auto flex flex-col h-[700px]'>
      <CardHeader className='flex flex-row items-center justify-between shrink-0'>
        <CardTitle>AI Аналитик Rkeeper (с памятью)</CardTitle>
        <div
          className={`text-xs px-2 py-1 rounded-full ${serverStatus === 'online' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {serverStatus === 'online' ? '● API Online' : '○ API Offline'}
        </div>
      </CardHeader>
      <CardContent className='flex-1 overflow-hidden p-0'>
        <ScrollArea ref={scrollRef} className='h-full p-4'>
          <div className='flex flex-col gap-4 pb-4'>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg w-full ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground max-w-[80%] self-end'
                    : 'bg-muted self-start'
                }`}
              >
                <div className='whitespace-pre-wrap text-sm leading-relaxed'>{msg.content}</div>
                {msg.charts && msg.charts.map((chart, idx) => renderChart(chart, idx))}
              </div>
            ))}
            {isLoading && (
              <div className='flex flex-col gap-2 self-start bg-muted p-3 rounded-lg animate-pulse w-[50%]'>
                <div className='h-4 bg-muted-foreground/20 rounded w-3/4'></div>
                <div className='h-4 bg-muted-foreground/20 rounded w-1/2'></div>
              </div>
            )}
            {messages.length === 0 && (
              <div className='text-center text-muted-foreground pt-20'>
                Задайте вопрос о продажах! Агент теперь помнит контекст разговора и рисует
                профессиональные графики.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className='p-4 border-t shrink-0'>
        <div className='flex w-full gap-2'>
          <Input
            placeholder='Введите ваш вопрос...'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={serverStatus !== 'online'}
            className='flex-1'
          />
          <Button onClick={sendMessage} disabled={isLoading || serverStatus !== 'online'}>
            {isLoading ? '...' : 'Отправить'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
