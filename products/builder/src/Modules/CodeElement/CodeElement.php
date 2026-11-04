<?php
/**
 * Code elements (docs/ai-full-power.md, layer 3; Studio's CodeElement): an Auvyx Section whose `auvyx.code` holds its own HTML, an
 * ES module, the effects libraries it names and the data sources it names. The saved page holds a plain section; here, when
 * the page is rendered, the HTML, the module (a JSON string in `<script type="application/json" data-auvyx-js-json>`, inert) and the
 * data sources' items go inside it, and assets/code.js runs the module when the element comes near the screen.
 * Only users with `unfiltered_html` keep `auvyx.code` when they save (the CustomCss module's guard), as with Custom HTML.
 *
 * @package Auvyx\Builder
 */

declare( strict_types=1 );

namespace Auvyx\Builder\Modules\CodeElement;

use Auvyx\Builder\Module;
use Auvyx\Builder\Plugin;
use Auvyx\Builder\Modules\DataSources\DataSources;

defined( 'ABSPATH' ) || exit;

final class CodeElement implements Module {

	public const HANDLE = 'auvyx-code';

	/**
	 * The libraries a code element may use on this site: the shipped ones (shared/code-libraries.json, like the Studio's
	 * CodeElement.Libraries), and the `pro` ones another plugin gives an address for (Auvyx Builder Pro: GSAP).
	 *
	 * @return string[]
	 */
	public static function libraries(): array {
		$shipped = array();
		foreach ( Plugin::shared_data( 'code-libraries' )['libraries'] as $library ) {
			if ( ! empty( $library['file'] ) ) {
				$shipped[] = (string) $library['name'];
			}
		}
		return array_merge( $shipped, array_keys( self::added() ) );
	}

	/**
	 * The `pro` libraries that have an address on this site (`auvyx_builder_code_library_urls`: name → https address), as
	 * code.js reads them: name → [address, what of the module the code gets].
	 *
	 * @return array<string, array{0: string, 1: string}>
	 */
	public static function added(): array {
		/**
		 * Addresses of the libraries Auvyx Builder lists but does not ship (`pro` in shared/code-libraries.json).
		 *
		 * @param array<string, string> $urls Name → https address of an ES module.
		 */
		$urls = (array) apply_filters( 'auvyx_builder_code_library_urls', array() );
		$out  = array();
		foreach ( Plugin::shared_data( 'code-libraries' )['libraries'] as $library ) {
			$name = (string) $library['name'];
			$url  = isset( $urls[ $name ] ) ? esc_url_raw( (string) $urls[ $name ], array( 'https' ) ) : '';
			if ( ! empty( $library['pro'] ) && '' !== $url ) {
				$out[ $name ] = array( $url, (string) $library['export'] );
			}
		}
		return $out;
	}

	public function id(): string {
		return 'code-element';
	}

	public function requires(): array {
		return array();
	}

	public function register(): void {
		add_action( 'init', array( $this, 'register_assets' ) );
		add_filter( 'render_block_auvyx/section', array( $this, 'render' ), 10, 2 );
	}

	public function register_assets(): void {
		wp_register_script(
			self::HANDLE,
			AUVYX_BUILDER_URL . 'assets/code.js',
			array(),
			AUVYX_BUILDER_VERSION,
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		// Where `source(name)` loads a public data source's items (DataSources' public route).
		wp_add_inline_script( self::HANDLE, 'window.auvyxCodeData=' . wp_json_encode( rest_url( 'auvyx/v1/data/' ) ) . ';', 'before' );
		$added = self::added();
		if ( $added ) {
			wp_add_inline_script( self::HANDLE, 'window.auvyxCodeLibs=' . wp_json_encode( $added ) . ';', 'before' );
		}
	}

	/**
	 * JSON for a `<script type="application/json">` that no later filter can alter: no < > & ' " in the bytes.
	 *
	 * @param mixed $value Value.
	 */
	private static function json( $value ): string {
		return (string) wp_json_encode( $value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	}

	/**
	 * @param string               $html  Rendered block.
	 * @param array<string, mixed> $block Parsed block.
	 */
	public function render( $html, $block ): string {
		$html = (string) $html;
		$code = $block['attrs']['auvyx']['code'] ?? null;
		if ( '' === $html || ! is_array( $code ) ) {
			return $html;
		}
		$markup = substr( (string) ( $code['markup'] ?? '' ), 0, 60000 );
		$script = substr( (string) ( $code['script'] ?? '' ), 0, 60000 );
		$libs   = array_values( array_intersect( array_map( 'strval', (array) ( $code['libs'] ?? array() ) ), self::libraries() ) );
		$uses   = array_slice( array_values( array_filter( array_map( 'strval', (array) ( $code['uses'] ?? array() ) ) ) ), 0, 10 );
		$inner  = $markup;
		if ( '' !== trim( $script ) ) {
			// As a JSON string with < > & ' " escaped: the_content's filters run after blocks render, and wptexturize reads
			// `a < b && c > d` as a tag and rewrites its & (assets/code.js reads both forms).
			$inner .= '<script type="application/json" data-auvyx-js-json>' . self::json( $script ) . '</script>';
			wp_enqueue_script( self::HANDLE );
		}
		if ( $uses ) {
			$data = array();
			foreach ( $uses as $name ) {
				$data[ $name ] = DataSources::items_for( $name );
			}
			$inner .= '<script type="application/json" data-auvyx-data>' . self::json( $data ) . '</script>';
		}
		$processor = new \WP_HTML_Tag_Processor( $html );
		if ( ! $processor->next_tag() ) {
			return $html;
		}
		$processor->set_attribute( 'data-auvyx-code', '' );
		if ( $libs ) {
			$processor->set_attribute( 'data-auvyx-libs', implode( ' ', $libs ) );
		}
		$html = $processor->get_updated_html();
		// The element's own content goes inside its tag (a code element holds no blocks of its own).
		$end = strrpos( $html, '</' );
		return false === $end ? $html : substr( $html, 0, $end ) . $inner . substr( $html, $end );
	}
}
