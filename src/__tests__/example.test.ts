describe('Example Test Suite', () => {
  it('should perform a basic assertion', () => {
    expect(true).toBe(true);
  });

  it('should add numbers correctly', () => {
    const sum = 2 + 3;
    expect(sum).toBe(5);
  });

  it('should verify string operations', () => {
    const greeting = 'Hello, Jest!';
    expect(greeting).toContain('Jest');
  });
});
