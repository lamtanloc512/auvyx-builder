<?php
/**
 * Canvas previews of WordPress blocks that cannot preview themselves in Auvyx Studio:
 * - WooCommerce Cart and Checkout are React apps: the server sends a loading skeleton that only their scripts fill
 *   in the visitor's browser. Auvyx Studio shows an outline of their sections instead (taken from the block's inner
 *   blocks), clearly marked as rendered on the live page.
 * - Shortcodes ([woocommerce_my_account], other plugins) render through do_shortcode; Woo's cart/checkout/account
 *   shortcodes need the visitor's session, so they get the same outline.
 * Previews are canvas-only: the saved markup never changes.
 *
 * @package Auvyx\Builder
 */

namespace Auvyx\Builder\Modules\Studio;

defined( 'ABSPATH' ) || exit;

final class Preview {

	/** Inner block name (suffix) → section title. */
	const SECTIONS = array(
		'checkout-express-payment-block'        => 'Express checkout',
		'checkout-contact-information-block'    => 'Contact information',
		'checkout-shipping-method-block'        => 'Delivery',
		'checkout-pickup-options-block'         => 'Pickup',
		'checkout-shipping-address-block'       => 'Shipping address',
		'checkout-billing-address-block'        => 'Billing address',
		'checkout-shipping-methods-block'       => 'Shipping options',
		'checkout-payment-block'                => 'Payment options',
		'checkout-additional-information-block' => 'Additional information',
		'checkout-order-note-block'             => 'Order note',
		'checkout-terms-block'                  => 'Terms',
		'checkout-actions-block'                => 'Place order',
		'cart-items-block'                      => 'Items',
		'cart-cross-sells-block'                => 'You may be interested in…',
		'cart-express-payment-block'            => 'Express checkout',
		'proceed-to-checkout-block'             => 'Proceed to checkout',
	);

	/**
	 * Preview HTML for a parsed block, given what render_block() produced.
	 *
	 * @param array<string, mixed> $block Parsed block.
	 * @param string               $html  Rendered HTML.
	 */
	public static function html( array $block, string $html ): string {
		$name = (string) ( $block['blockName'] ?? '' );
		if ( 'woocommerce/checkout' === $name || 'woocommerce/cart' === $name ) {
			return self::outline( $block );
		}
		if ( 'core/shortcode' === $name ) {
			return self::shortcode( (string) ( $block['innerHTML'] ?? '' ) );
		}
		if ( false !== strpos( $html, 'wc-block-components-skeleton' ) || false !== strpos( $html, 'wc-block-skeleton' ) ) {
			return self::note( self::title( $name ), __( 'Rendered in the visitor\'s browser by WooCommerce.', 'auvyx-builder' ) );
		}
		return self::expand( $html );
	}

	/**
	 * A static block can save a shortcode in its markup (Contact Form 7's block does): the live page expands it through
	 * the_content, so the preview does too. Text in brackets that is not a registered shortcode stays as it is.
	 *
	 * @param string $html Rendered HTML.
	 */
	private static function expand( string $html ): string {
		if ( false === strpos( $html, '[' ) || ! preg_match( '/' . get_shortcode_regex() . '/', $html ) ) {
			return $html;
		}
		try {
			return do_shortcode( $html );
		} catch ( \Throwable $e ) {
			return $html;
		}
	}

	private static function title( string $name ): string {
		$type = \WP_Block_Type_Registry::get_instance()->get_registered( $name );
		return $type && '' !== (string) $type->title ? (string) $type->title : $name;
	}

	private static function shortcode( string $text ): string {
		$text = trim( $text );
		$woo  = array(
			'woocommerce_cart'           => __( 'Cart', 'auvyx-builder' ),
			'woocommerce_checkout'       => __( 'Checkout', 'auvyx-builder' ),
			'woocommerce_my_account'     => __( 'My account', 'auvyx-builder' ),
			'woocommerce_order_tracking' => __( 'Order tracking', 'auvyx-builder' ),
		);
		if ( preg_match( '/^\[(\w+)/', $text, $m ) && isset( $woo[ $m[1] ] ) ) {
			return self::note( $woo[ $m[1] ], __( 'WooCommerce shows this page for the visitor who opens it (their account, cart or order).', 'auvyx-builder' ) );
		}
		try {
			$out = do_shortcode( $text );
		} catch ( \Throwable $e ) {
			$out = '';
		}
		return '' !== trim( wp_strip_all_tags( $out ) ) || false !== strpos( $out, '<img' ) ? $out : self::note( $text, __( 'This shortcode shows nothing in the editor.', 'auvyx-builder' ) );
	}

	/** Labelled frame for a block with no preview. */
	public static function note( string $title, string $text ): string {
		return '<div class="auvyx-preview-note"><strong>' . esc_html( $title ) . '</strong><span>' . esc_html( $text ) . '</span></div>';
	}

	/**
	 * Cart / Checkout: their sections as outlined boxes, in two columns like the real layout.
	 *
	 * @param array<string, mixed> $block Parsed block.
	 */
	private static function outline( array $block ): string {
		$main = array();
		$side = array();
		$walk = static function ( array $blocks, bool $aside ) use ( &$walk, &$main, &$side ) {
			foreach ( $blocks as $inner ) {
				$suffix  = substr( (string) ( $inner['blockName'] ?? '' ), strlen( 'woocommerce/' ) );
				$is_side = false !== strpos( $suffix, 'totals-block' ) || false !== strpos( $suffix, 'order-summary' ) || $aside;
				if ( isset( self::SECTIONS[ $suffix ] ) ) {
					if ( $is_side ) {
						$side[] = self::SECTIONS[ $suffix ];
					} else {
						$main[] = self::SECTIONS[ $suffix ];
					}
				}
				$walk( (array) ( $inner['innerBlocks'] ?? array() ), $is_side );
			}
		};
		$walk( (array) ( $block['innerBlocks'] ?? array() ), false );
		$checkout = 'woocommerce/checkout' === ( $block['blockName'] ?? '' );
		if ( ! $main ) {
			$main = $checkout ? array( 'Contact information', 'Shipping address', 'Payment options', 'Place order' ) : array( 'Items' );
		}
		array_unshift( $side, __( 'Order summary', 'auvyx-builder' ) );
		$box   = static function ( string $title, bool $fields ): string {
			return '<div class="auvyx-preview-box"><strong>' . esc_html( $title ) . '</strong>' . ( $fields ? '<i></i><i></i>' : '' ) . '</div>';
		};
		$left  = implode( '', array_map( static fn( $t ) => $box( $t, ! in_array( $t, array( 'Place order', 'Proceed to checkout', 'Terms' ), true ) ), array_values( array_unique( $main ) ) ) );
		$right = implode( '', array_map( static fn( $t ) => $box( $t, true ), array_values( array_unique( $side ) ) ) );
		return '<div class="auvyx-preview-woo"><div class="auvyx-preview-woo__head">' . esc_html( $checkout ? __( 'Checkout (WooCommerce)', 'auvyx-builder' ) : __( 'Cart (WooCommerce)', 'auvyx-builder' ) ) . '<span>' . esc_html__( 'Outline of its sections: the form renders on the live page. Edit its fields in the block editor.', 'auvyx-builder' ) . '</span></div><div class="auvyx-preview-woo__cols"><div>' . $left . '</div><div>' . $right . '</div></div></div>';
	}
}
