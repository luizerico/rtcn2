import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AnswersAreaTree from '@/components/surveys/AnswersAreaTree';

const questions = [
  {
    questionId: 'q1',
    code: 'GT11',
    area: 'GT',
    prompt: 'Plan?',
    type: 'score',
    maxPoints: 2,
    weight: 1,
  },
  {
    questionId: 'q2',
    area: 'GT',
    prompt: 'Comment?',
    type: 'text',
  },
];

describe('AnswersAreaTree', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it('renders a left-to-right tree with area aggregate scores', () => {
    render(
      <AnswersAreaTree
        title="Instrument sheet"
        questions={questions}
        answers={[{ questionId: 'q1', value: 2 }]}
        rootScore={{ letter: 'A', percent: 100, total: 2, maxTotal: 2 }}
      />
    );

    expect(screen.getByRole('tree', { name: 'Survey answers by area' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /Instrument sheet/ })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /GT · A · 100% · 2\/2/ })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /GT11 · Plan/ })).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens a selected area via onSelect without collapsing it', () => {
    const onSelect = jest.fn();
    render(
      <AnswersAreaTree
        title="Instrument sheet"
        questions={questions}
        answers={[{ questionId: 'q1', value: 1 }]}
        rootScore={{ letter: 'C', percent: 50, total: 1, maxTotal: 2 }}
        onSelect={onSelect}
      />
    );

    fireEvent.pointerDown(screen.getByRole('treeitem', { name: /GT ·/ }), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(screen.getByRole('treeitem', { name: /GT ·/ }), { button: 0, clientX: 10, clientY: 10 });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'area', areaId: 'GT' })
    );
    expect(screen.getByRole('treeitem', { name: /GT11 · Plan/ })).toBeTruthy();
  });

  it('zooms in and out from the toolbar', () => {
    render(
      <AnswersAreaTree
        title="Instrument sheet"
        questions={questions}
        answers={[{ questionId: 'q1', value: 2 }]}
        rootScore={{ letter: 'A', percent: 100, total: 2, maxTotal: 2 }}
      />
    );

    expect(screen.getByText('100%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('115%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('switches to star and organograma dispositions and remembers the choice', () => {
    render(
      <AnswersAreaTree
        title="Instrument sheet"
        questions={questions}
        answers={[{ questionId: 'q1', value: 2 }]}
        rootScore={{ letter: 'A', percent: 100, total: 2, maxTotal: 2 }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Star' }));
    expect(screen.getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('answers_tree_disposition_v1')).toBe('star');

    fireEvent.click(screen.getByRole('button', { name: 'Organograma' }));
    expect(screen.getByRole('button', { name: 'Organograma' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(window.localStorage.getItem('answers_tree_disposition_v1')).toBe('organograma');
  });

  it('collapses and expands an area from the keyboard', () => {
    render(
      <AnswersAreaTree
        title="Instrument sheet"
        questions={questions}
        answers={[{ questionId: 'q1', value: 1 }]}
        rootScore={{ letter: 'C', percent: 50, total: 1, maxTotal: 2 }}
      />
    );

    const area = screen.getByRole('treeitem', { name: /GT ·/ });
    expect(area.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(area.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('treeitem', { name: /GT11 · Plan/ })).toBeNull();
  });
});
