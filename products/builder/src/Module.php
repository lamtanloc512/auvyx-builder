<?php
/**
 * Every feature is a module. Modules only add hooks in register(); including a
 * file must never have side effects.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder;

defined( 'ABSPATH' ) || exit;

interface Module {

	/** Stable id, used for feature flags and the `auvyx_builder_modules` filter. */
	public function id(): string;

	/**
	 * Minimum versions this module needs. Modules whose requirements are not
	 * met are skipped; the rest of the plugin keeps working.
	 *
	 * @return array{wp?: string, php?: string}
	 */
	public function requires(): array;

	public function register(): void;
}
