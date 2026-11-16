import { useState } from 'react';
import {
  Button,
  Calendar,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { systemName, systemOptions, systems, today } from './data';
import { useDemo } from './store';
import { PageTitle } from './ui';

export function ReviewPage() {
  const { data, go } = useDemo();
  const [month, setMonth] = useState(dayjs(today)),
    [system, setSystem] = useState('all'),
    [mode, setMode] = useState('timeline');
  const first = month.startOf('month'),
    last = month.endOf('month');
  const tasks = data.tasks.filter(
    (t) =>
      !t.deleted &&
      (system === 'all' || t.system === system) &&
      dayjs(t.started).isBefore(last) &&
      !dayjs(t.completed || today).isBefore(first),
  );
  const done = tasks.filter((t) => t.done).length;
  const days = Array.from({ length: month.daysInMonth() }, (_, i) => i + 1);
  return (
    <div className="page review-page">
      <PageTitle
        title="工作回顾"
        description="把开始到完成的日历跨度连起来，看见工作的推进。"
        extra={
          <Segmented
            aria-label="回顾视图"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'timeline', label: '时间线', icon: <ClockIcon /> },
              { value: 'calendar', label: '日历', icon: <CalendarBlankIcon /> },
            ]}
          />
        }
      />
      <Row gutter={[18, 18]} className="review-stats">
        <Col xs={8}>
          <Card size="small">
            <Statistic title="本月涉及任务" value={tasks.length} suffix="项" />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="已完成" value={done} suffix="项" />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="继续推进" value={tasks.length - done} suffix="项" />
          </Card>
        </Col>
      </Row>
      <div className="section-toolbar">
        <Space>
          <Button
            aria-label="上个月"
            icon={<ArrowLeftIcon />}
            onClick={() => setMonth(month.subtract(1, 'month'))}
          />
          <DatePicker
            picker="month"
            allowClear={false}
            aria-label="回顾月份"
            value={month}
            onChange={(v) => v && setMonth(v)}
          />
          <Button
            aria-label="下个月"
            icon={<ArrowRightIcon />}
            onClick={() => setMonth(month.add(1, 'month'))}
          />
          <Button onClick={() => setMonth(dayjs(today))}>本月</Button>
        </Space>
        <Select
          aria-label="回顾系统"
          value={system}
          options={[{ value: 'all', label: '全部系统' }, ...systemOptions]}
          onChange={setSystem}
          style={{ width: 175 }}
        />
      </div>
      {mode === 'timeline' ? (
        <Card className="review-timeline">
          <div className="gantt-scroll">
            <div className="gantt">
              <div className="gantt-head">
                <strong>任务与所属系统</strong>
                <div className="gantt-days">
                  {days.map((d) => (
                    <span key={d} className={month.date(d).day() % 6 === 0 ? 'weekend' : ''}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              {tasks.map((t) => {
                const start = Math.max(0, dayjs(t.started).diff(first, 'day'));
                const end = Math.min(
                  days.length,
                  dayjs(t.completed || today).diff(first, 'day') + 1,
                );
                return (
                  <div className="gantt-row" key={t.id}>
                    <div className="gantt-label">
                      <Button type="text" onClick={() => go(`tasks/${t.id}`)}>
                        {t.title}
                      </Button>
                      <Typography.Text type="secondary">{systemName(t.system)}</Typography.Text>
                    </div>
                    <div className="gantt-track">
                      {days.map((d) => (
                        <span
                          className={
                            d === 16 && month.format('YYYY-MM') === '2026-11' ? 'today-line' : ''
                          }
                          key={d}
                        />
                      ))}
                      <Tooltip title={`${t.started} — ${t.completed || `${today}（持续中）`}`}>
                        <button
                          className={`gantt-bar ${t.done ? 'is-done' : ''}`}
                          style={{
                            left: `${(start / days.length) * 100}%`,
                            width: `${(Math.max(1, end - start) / days.length) * 100}%`,
                          }}
                          onClick={() => go(`tasks/${t.id}`)}
                          aria-label={`查看${t.title}的回顾跨度`}
                        >
                          {t.done ? <CheckCircleIcon size={13} /> : <ClockIcon size={13} />}
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
              {!tasks.length && (
                <Empty description="本月暂无相关任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </div>
          <Flex justify="space-between" wrap gap={12} style={{ marginTop: 20 }}>
            <Space>
              <Tag color="blue">推进中</Tag>
              <Tag color="success">已完成</Tag>
            </Space>
            <Typography.Text type="secondary">
              日历跨度不代表实际工时；未完成任务延伸至今天。
            </Typography.Text>
          </Flex>
        </Card>
      ) : (
        <Card className="review-calendar">
          <Calendar
            value={month}
            onPanelChange={setMonth}
            cellRender={(date, info) =>
              info.type !== 'date' ? (
                info.originNode
              ) : (
                <div>
                  {tasks
                    .filter(
                      (t) => (t.completed || t.due).slice(0, 10) === date.format('YYYY-MM-DD'),
                    )
                    .map((t) => (
                      <Tag
                        key={t.id}
                        color={t.done ? 'success' : 'blue'}
                        onClick={() => go(`tasks/${t.id}`)}
                        style={{
                          cursor: 'pointer',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.title}
                      </Tag>
                    ))}
                </div>
              )
            }
          />
        </Card>
      )}
    </div>
  );
}
