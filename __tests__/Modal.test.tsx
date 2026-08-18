import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

describe('Modal', () => {
  it('closes on backdrop pointerdown when the target is the overlay', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen onClose={onClose} title="Example">
        <p>Body</p>
      </Modal>
    );

    fireEvent.pointerDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when pointerdown starts on the dialog', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen onClose={onClose} title="Example">
        <p>Body</p>
      </Modal>
    );

    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on backdrop when closeOnBackdrop is false', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen onClose={onClose} title="Example" closeOnBackdrop={false}>
        <p>Body</p>
      </Modal>
    );

    fireEvent.pointerDown(screen.getByRole('presentation'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
