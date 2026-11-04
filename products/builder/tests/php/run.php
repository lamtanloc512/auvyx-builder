<?php
/**
 * Minimal PHP test runner, executed inside WordPress Playground (php-wasm), so
 * contributors need neither PHP nor Docker: `bun run test:php`.
 * Test files: tests/php/*-test.php, each calling auvyx_test( name, callable ).
 *
 * @package Auvyx\Builder
 */

require '/wordpress/wp-load.php';

$GLOBALS['auvyx_tests'] = array();

// The modules are tested as on an activated site; access-test.php checks the lock itself.

function auvyx_test( string $name, callable $test ): void {
	$GLOBALS['auvyx_tests'][ $name ] = $test;
}

/**
 * @param mixed $expected Expected.
 * @param mixed $actual   Actual.
 */
function auvyx_assert_same( $expected, $actual, string $message = '' ): void {
	if ( $expected !== $actual ) {
		throw new RuntimeException( $message . "\n    expected: " . var_export( $expected, true ) . "\n    actual:   " . var_export( $actual, true ) );
	}
}

function auvyx_assert_contains( string $needle, string $haystack, string $message = '' ): void {
	if ( false === strpos( $haystack, $needle ) ) {
		throw new RuntimeException( $message . "\n    missing: " . $needle . "\n    in: " . substr( $haystack, 0, 600 ) );
	}
}

function auvyx_assert_not_contains( string $needle, string $haystack, string $message = '' ): void {
	if ( false !== strpos( $haystack, $needle ) ) {
		throw new RuntimeException( $message . "\n    unexpected: " . $needle );
	}
}

foreach ( glob( __DIR__ . '/*-test.php' ) as $auvyx_file ) {
	require $auvyx_file;
}

$auvyx_failed = 0;
foreach ( $GLOBALS['auvyx_tests'] as $auvyx_name => $auvyx_callable ) {
	try {
		$auvyx_callable();
		echo "  ✓ {$auvyx_name}\n";
	} catch ( Throwable $e ) {
		++$auvyx_failed;
		echo "  ✗ {$auvyx_name}: " . $e->getMessage() . "\n";
	}
}

$auvyx_total = count( $GLOBALS['auvyx_tests'] );
echo "\nPHP " . PHP_VERSION . ', WP ' . get_bloginfo( 'version' ) . ": {$auvyx_total} tests, {$auvyx_failed} failed\n";
echo $auvyx_failed > 0 ? "AUVYX_TESTS_FAILED\n" : "AUVYX_TESTS_PASSED\n";
